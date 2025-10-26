use std::fmt::Display;

use reqwest::{StatusCode, header::HeaderValue};

#[derive(Debug)]
pub enum EventError {
    IoError(std::io::Error),
}

impl Display for EventError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EventError::IoError(error) => {
                write!(f, "failed to process event due to I/O error: {error}")
            }
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum EventSourceError {
    BadStatus(StatusCode),
    BadContentType(Option<HeaderValue>),
}

impl Display for EventSourceError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EventSourceError::BadStatus(status_code) => {
                write!(f, "expecting status code `200`, found: {status_code}")
            }
            EventSourceError::BadContentType(None) => {
                write!(
                    f,
                    "expecting \"text/event-stream\" content type, found none"
                )
            }
            EventSourceError::BadContentType(Some(header_value)) => {
                let content_type = header_value.to_str();
                match content_type {
                    Ok(content_type) => {
                        write!(
                            f,
                            "expecting \"text/event-stream\", found: \"{content_type}\"",
                        )
                    }
                    Err(_) => {
                        write!(f, "expecting \"text/event-stream\", found invalid value")
                    }
                }
            }
        }
    }
}
