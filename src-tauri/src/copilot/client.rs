use async_trait::async_trait;
use futures_util::StreamExt;
use llm_proxy_core::LLMClient;
use llm_proxy_openai::StreamChunk;
use std::sync::Arc;

use bytes::Bytes;
use llm_proxy_core::{ClientProvider, Error, TokenProvider, UrlProvider};
use llm_proxy_openai::{ChatCompletionRequest, ErrorResponse};
use tokio::sync::mpsc;
use tracing::{debug, error, info, warn};

use super::providers::{
    client_provider::CopilotClientProvider, token_provider::CopilotTokenProvider,
    url_provider::CopilotUrlProvider,
};

/// OpenAI-specific implementation of `LLMClient`
pub struct CopilotClient {
    client: Arc<CopilotClientProvider>,
    token: Arc<CopilotTokenProvider>,
    url: Arc<CopilotUrlProvider>,
}

impl Clone for CopilotClient {
    fn clone(&self) -> Self {
        Self {
            client: self.client.clone(),
            token: self.token.clone(),
            url: self.url.clone(),
        }
    }
}

impl CopilotClient {
    /// Create a new `OpenAI` client with the given providers
    pub fn new(
        client_provider: Arc<CopilotClientProvider>,
        token_provider: Arc<CopilotTokenProvider>,
        url_provider: Arc<CopilotUrlProvider>,
    ) -> Self {
        Self {
            client: client_provider,
            token: token_provider,
            url: url_provider,
        }
    }

    /// Send request to `OpenAI` and get response
    async fn send_request(
        &self,
        request: &ChatCompletionRequest,
        client: reqwest::Client,
        token: String,
        url: String,
    ) -> Result<reqwest::Response, Error> {
        let response = client
            .post(url)
            .bearer_auth(token)
            .json(&request)
            .send()
            .await
            .map_err(|e| Error::LLMError(format!("Failed to send request to OpenAI: {e}")))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_body = response.json::<ErrorResponse>().await.map_err(|e| {
                Error::LLMError(format!(
                    "Failed to parse OpenAI error response: {e}, status: {status}"
                ))
            })?;
            return Err(Error::LLMError(format!(
                "OpenAI request failed: {} ({})",
                error_body.error.message, status
            )));
        }

        Ok(response)
    }

    /// Process a streaming response from `OpenAI`
    async fn handle_stream(
        self,
        response: reqwest::Response,
        tx: mpsc::Sender<Result<Bytes, Error>>,
    ) -> Result<(), Error> {
        let mut stream = response.bytes_stream();

        while let Some(chunk_result) = stream.next().await {
            match chunk_result {
                Ok(chunk) => self.process_chunk(chunk, &tx).await?,
                Err(e) => {
                    self.send_error(&tx, format!("Error reading chunk from OpenAI: {e}"))
                        .await?;
                }
            }
        }

        Ok(())
    }

    /// Process a single chunk of data from the stream
    async fn process_chunk(
        &self,
        chunk: Bytes,
        tx: &mpsc::Sender<Result<Bytes, Error>>,
    ) -> Result<(), Error> {
        let lines = String::from_utf8_lossy(&chunk);
        debug!(chunk = %lines, "Received raw chunk");

        for line in lines.lines() {
            self.process_line(line, &chunk, tx).await?;
        }

        Ok(())
    }

    /// Process a single line from the chunk
    async fn process_line(
        &self,
        line: &str,
        original_chunk: &Bytes,
        tx: &mpsc::Sender<Result<Bytes, Error>>,
    ) -> Result<(), Error> {
        if !line.starts_with("data: ") {
            return Ok(());
        }

        let data = line[5..].trim();
        debug!(data = %data, "Processing data line");

        if data == "[DONE]" {
            info!("Received [DONE] signal");
            return Ok(());
        }

        self.parse_and_send_chunk(data, original_chunk, tx).await
    }

    /// Parse the chunk data and send it through the channel
    async fn parse_and_send_chunk(
        &self,
        data: &str,
        original_chunk: &Bytes,
        tx: &mpsc::Sender<Result<Bytes, Error>>,
    ) -> Result<(), Error> {
        match serde_json::from_str::<StreamChunk>(data) {
            Ok(chunk_data) => {
                debug!(?chunk_data, "Successfully parsed chunk");
                self.send_chunk(original_chunk, tx).await
            }
            Err(e) => {
                error!(
                    error = %e,
                    data = %data,
                    "Failed to parse OpenAI stream chunk"
                );
                self.send_error(tx, format!("Failed to parse OpenAI stream chunk: {e}"))
                    .await
            }
        }
    }

    /// Send a chunk through the channel
    async fn send_chunk(
        &self,
        chunk: &Bytes,
        tx: &mpsc::Sender<Result<Bytes, Error>>,
    ) -> Result<(), Error> {
        if tx.send(Ok(chunk.clone())).await.is_err() {
            warn!("Failed to send chunk - receiver dropped");
        }
        Ok(())
    }

    /// Send an error message through the channel
    async fn send_error(
        &self,
        tx: &mpsc::Sender<Result<Bytes, Error>>,
        error_message: String,
    ) -> Result<(), Error> {
        if tx.send(Err(Error::LLMError(error_message))).await.is_err() {
            warn!("Failed to send error - receiver dropped");
        }
        Ok(())
    }

    /// Process a non-streaming response from `OpenAI`
    async fn handle_non_stream(
        self,
        response: reqwest::Response,
        tx: mpsc::Sender<Result<Bytes, Error>>,
    ) -> Result<(), Error> {
        let bytes = response.bytes().await.map_err(|e| {
            Error::LLMError(format!("Failed to read OpenAI non-streaming response: {e}"))
        })?;

        if tx.send(Ok(bytes)).await.is_err() {
            warn!("Failed to send response - receiver dropped");
        }

        Ok(())
    }
}

#[async_trait]
impl LLMClient<ChatCompletionRequest> for CopilotClient {
    async fn execute(
        &self,
        request: ChatCompletionRequest,
    ) -> Result<mpsc::Receiver<Result<Bytes, Error>>, Error> {
        // 1. Get dependencies
        let client = self
            .client
            .get_client()
            .await
            .map_err(|e| Error::LLMError(format!("Failed to get HTTP client: {e}")))?;
        let token = self
            .token
            .get_token()
            .await
            .map_err(|e| Error::LLMError(format!("Failed to get API token: {e}")))?;
        let url = self
            .url
            .get_url()
            .map_err(|e| Error::LLMError(format!("Failed to get API URL: {e}")))?;

        // 2. Create response channel
        let (tx, rx) = mpsc::channel(100);

        // 3. Send request and handle response
        let response = self.send_request(&request, client, token, url).await?;

        // 4. Handle response based on streaming flag
        let client = self.clone();
        let stream = request.stream;
        info!("The request is streaming: {}", stream);
        tokio::spawn(async move {
            let result = if stream {
                client.handle_stream(response, tx).await
            } else {
                client.handle_non_stream(response, tx).await
            };

            if let Err(e) = result {
                error!(error = %e, "Error handling OpenAI response");
            }
        });

        Ok(rx)
    }
}
