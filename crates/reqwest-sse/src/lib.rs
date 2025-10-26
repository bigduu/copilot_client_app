//! # `reqwest-sse`
//!
//!  `reqwest-sse` is a lightweight Rust library that extends
//! [reqwest](https://docs.rs/reqwest) by adding native support for handling
//! [Server-Sent Events (SSE)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
//! . It introduces the [`EventSource`] trait, which enhances reqwest's [`Response`]
//! type with an ergonomic `.events()` method. This method transforms the
//! response body into an asynchronous [Stream] of SSE [`Event`]s, enabling
//! seamless integration of real-time event handling in applications
//! using the familiar reqwest HTTP client and the [`StreamExt`] API.
//!
//! ## Example
//!
//! ```rust,no_run
//! use tokio_stream::StreamExt;
//!
//! use reqwest_sse::EventSource;
//!
//! #[tokio::main]
//! async fn main() {
//!     let mut events = reqwest::get("https://sse.test-free.online/api/story")
//!         .await.unwrap()
//!         .events()
//!         .await.unwrap();
//!
//!     while let Some(Ok(event)) = events.next().await {
//!         println!("{event:?}");
//!     }
//! }
//! ```
pub mod error;

use std::{pin::Pin, time::Duration};

use async_stream::try_stream;
use reqwest::{
    Response, StatusCode,
    header::{CONTENT_TYPE, HeaderValue},
};
use tokio::io::AsyncBufReadExt;
use tokio_stream::{Stream, StreamExt};
use tokio_util::io::StreamReader;

use crate::error::{EventError, EventSourceError};

/// `text/event-stream` MIME type as [`HeaderValue`].
pub static MIME_EVENT_STREAM: HeaderValue = HeaderValue::from_static("text/event-stream");

/// Internal buffer used to accumulate lines of an SSE (Server-Sent Events) stream.
///
/// A single [`EventBuffer`] can be used to process the whole stream. [`set_event_type`] and [`push_data`]
/// methods update the state. [`produce_event`] produces a proper [`Event`] and prepares the internal
/// state to process further data.
struct EventBuffer {
    event_type: String,
    data: String,
    last_event_id: Option<String>,
    retry: Option<Duration>,
}

impl EventBuffer {
    /// Creates fresh new [`EventBuffer`].
    #[allow(clippy::new_without_default)]
    fn new() -> Self {
        Self {
            event_type: String::new(),
            data: String::new(),
            last_event_id: None,
            retry: None,
        }
    }

    /// Produces a [`Event`], if current state allow it.
    ///
    /// Reset the internal state to process further data.
    fn produce_event(&mut self) -> Option<PlainEvent> {
        let event = if self.data.is_empty() {
            None
        } else {
            Some(PlainEvent {
                event_type: if self.event_type.is_empty() {
                    "message".to_string()
                } else {
                    self.event_type.clone()
                },
                data: self.data.to_string(),
                last_event_id: self.last_event_id.clone(),
                retry: self.retry,
            })
        };

        self.event_type.clear();
        self.data.clear();

        event
    }

    /// Set the [`Event`]'s type. Overide previous value.
    fn set_event_type(&mut self, event_type: &str) {
        self.event_type.clear();
        self.event_type.push_str(event_type);
    }

    /// Extends internal data with given data.
    fn push_data(&mut self, data: &str) {
        if !self.data.is_empty() {
            self.data.push('\n');
        }
        self.data.push_str(data);
    }

    fn set_id(&mut self, id: &str) {
        self.last_event_id = Some(id.to_string());
    }

    fn set_retry(&mut self, retry: Duration) {
        self.retry = Some(retry);
    }
}

/// Parse line to split field name and value, applying proper trimming.
fn parse_line(line: &str) -> (&str, &str) {
    let (field, value) = line.split_once(':').unwrap_or((line, ""));
    let value = value.strip_prefix(' ').unwrap_or(value);
    (field, value)
}

/// Server-Sent Event representation.
#[derive(Debug, Clone, Eq, PartialEq)]
pub struct PlainEvent {
    /// A string identifying the type of event described.
    pub event_type: String,
    /// The data field for the message.
    pub data: String,
    /// Last event ID value.
    pub last_event_id: Option<String>,
    /// Reconnection time.
    pub retry: Option<Duration>,
}

/// Server-Sent Event representation.
#[derive(Debug, Clone, Eq, PartialEq)]
pub struct JsonEvent<T: serde::de::DeserializeOwned> {
    /// A string identifying the type of event described.
    pub event_type: String,
    /// The data field for the message.
    pub data: Data<T>,
    /// Last event ID value.
    pub last_event_id: Option<String>,
    /// Reconnection time.
    pub retry: Option<Duration>,
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub enum Data<T: serde::de::DeserializeOwned> {
    Plain(String),
    Json(T),
}

impl PlainEvent {
    /// Converts the plain event into a JSON event by deserializing the data field.
    pub fn json<T: serde::de::DeserializeOwned>(self) -> Result<JsonEvent<T>, serde_json::Error> {
        match self.event_type.as_str() {
            "message" => Ok(JsonEvent {
                event_type: self.event_type,
                data: Data::Json(serde_json::from_str(&self.data)?),
                last_event_id: self.last_event_id,
                retry: self.retry,
            }),
            _ => Ok(JsonEvent {
                event_type: self.event_type,
                data: Data::Json(serde_json::from_str(&self.data)?),
                last_event_id: self.last_event_id,
                retry: self.retry,
            }),
        }
    }
}

/// A trait for consuming a [`Response`] as a [`Stream`] of Server-Sent [`Event`]s (SSE).
pub trait EventSource {
    /// Converts the [`Response`] into a stream of Server-Sent Events.
    /// Returns it as a faillable [`Stream`] of [`Event`]s.
    ///
    /// # Errors
    ///
    /// Returns an [`EventSourceError`] if:
    /// - The response status is not `200 OK`
    /// - The `Content-Type` header is missing or not `text/event-stream`
    ///
    /// The stream yields an [`EventError`] when error occure on event reading.
    fn events(
        self,
    ) -> impl Future<
        Output = Result<
            Pin<Box<impl Stream<Item = Result<PlainEvent, EventError>>>>,
            EventSourceError,
        >,
    > + Send;
}

impl EventSource for Response {
    async fn events(
        self,
    ) -> Result<Pin<Box<impl Stream<Item = Result<PlainEvent, EventError>>>>, EventSourceError>
    {
        let status = self.status();
        if status != StatusCode::OK {
            return Err(EventSourceError::BadStatus(status));
        }
        let content_type = self.headers().get(CONTENT_TYPE);
        if content_type != Some(&MIME_EVENT_STREAM) {
            return Err(EventSourceError::BadContentType(content_type.cloned()));
        }

        let mut stream = StreamReader::new(
            self.bytes_stream()
                .map(|result| result.map_err(std::io::Error::other)),
        );

        let mut line_buffer = String::new();
        let mut event_buffer = EventBuffer::new();

        let stream = Box::pin(try_stream! {
            loop {
                line_buffer.clear();
                let count = stream.read_line(&mut line_buffer).await.map_err(EventError::IoError)?;
                if count == 0 {
                    break;
                }
                let line = if let Some(line) = line_buffer.strip_suffix('\n') {
                    line
                } else {
                    &line_buffer
                };

                // dispatch
                if line.is_empty() {
                    if let Some(event) = event_buffer.produce_event() {
                        yield event;
                    }
                    continue;
                }

                let (field, value) = parse_line(line);

                match field {
                    "event" => {
                        event_buffer.set_event_type(value);
                    }
                    "data" => {
                        event_buffer.push_data(value);
                    }
                    "id" => {
                        event_buffer.set_id(value);
                    }
                    "retry" => {
                        if let Ok(millis) = value.parse() {
                            event_buffer.set_retry(Duration::from_millis(millis));
                        }
                    }
                    _ => {}
                }
            }
        });

        Ok(stream)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_line_properly() {
        let (field, value) = parse_line("event: message");
        assert_eq!(field, "event");
        assert_eq!(value, "message");

        let (field, value) = parse_line("non-standard field");
        assert_eq!(field, "non-standard field");
        assert_eq!(value, "");

        let (field, value) = parse_line("data:data with : inside");
        assert_eq!(field, "data");
        assert_eq!(value, "data with : inside");
    }
}
