//! Shared SSE -> [`LLMStream`] adapter.

use eventsource_stream::Eventsource;
use futures_util::StreamExt;
use reqwest::Response;

use crate::provider::{LLMError, LLMStream, Result};
use crate::types::LLMChunk;

fn to_stream_error(err: LLMError) -> LLMError {
    match err {
        LLMError::Stream(msg) => LLMError::Stream(msg),
        other => LLMError::Stream(other.to_string()),
    }
}

/// Convert an SSE HTTP [`Response`] into an [`LLMStream`].
///
/// `handler` receives the SSE event name and data payload for each event, and can either:
/// - return `Ok(Some(chunk))` to emit a chunk
/// - return `Ok(None)` to skip an event
/// - return `Err(_)` to emit a stream error (mapped to `LLMError::Stream`)
pub fn llm_stream_from_sse<H>(response: Response, mut handler: H) -> LLMStream
where
    H: FnMut(&str, &str) -> Result<Option<LLMChunk>> + Send + 'static,
{
    let stream = response
        .bytes_stream()
        .eventsource()
        .map(move |event| {
            let event = event.map_err(|e| LLMError::Stream(e.to_string()))?;
            handler(event.event.as_str(), event.data.as_str()).map_err(to_stream_error)
        })
        .filter_map(|result| async move {
            match result {
                Ok(Some(chunk)) => Some(Ok(chunk)),
                Ok(None) => None,
                Err(err) => Some(Err(err)),
            }
        });

    Box::pin(stream)
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::StreamExt;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn network_tests_disabled() -> bool {
        std::env::var_os("CODEX_SANDBOX_NETWORK_DISABLED").is_some()
    }

    #[tokio::test]
    async fn llm_stream_from_sse_filters_none_and_passes_event_name_and_data() {
        if network_tests_disabled() {
            return;
        }

        let mock_server = MockServer::start().await;

        let sse_body = concat!(
            "event: token\n",
            "data: hello\n",
            "\n",
            "event: token\n",
            "data: skip\n",
            "\n",
        );

        Mock::given(method("GET"))
            .and(path("/sse"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("content-type", "text/event-stream")
                    .set_body_string(sse_body),
            )
            .mount(&mock_server)
            .await;

        let response = reqwest::Client::new()
            .get(format!("{}/sse", mock_server.uri()))
            .send()
            .await
            .expect("response");

        let mut stream = llm_stream_from_sse(response, |event, data| {
            if data == "skip" {
                return Ok(None);
            }
            Ok(Some(LLMChunk::Token(format!("{event}:{data}"))))
        });

        let mut out = Vec::new();
        while let Some(item) = stream.next().await {
            out.push(item.expect("chunk"));
        }

        assert_eq!(out.len(), 1);
        match &out[0] {
            LLMChunk::Token(token) => assert_eq!(token, "token:hello"),
            other => panic!("expected LLMChunk::Token, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn llm_stream_from_sse_maps_handler_errors_to_stream_error() {
        if network_tests_disabled() {
            return;
        }

        let mock_server = MockServer::start().await;

        let sse_body = concat!("event: token\n", "data: boom\n", "\n");

        Mock::given(method("GET"))
            .and(path("/sse"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("content-type", "text/event-stream")
                    .set_body_string(sse_body),
            )
            .mount(&mock_server)
            .await;

        let response = reqwest::Client::new()
            .get(format!("{}/sse", mock_server.uri()))
            .send()
            .await
            .expect("response");

        let mut stream = llm_stream_from_sse(response, |_event, _data| {
            Err(LLMError::Api("boom".to_string()))
        });

        let Some(item) = stream.next().await else {
            panic!("expected one stream item");
        };

        match item {
            Ok(chunk) => panic!("expected error, got chunk: {chunk:?}"),
            Err(LLMError::Stream(msg)) => assert!(msg.contains("API error")),
            Err(other) => panic!("expected LLMError::Stream, got: {other:?}"),
        }
    }
}
