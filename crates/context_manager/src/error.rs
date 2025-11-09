use std::error::Error;
use std::fmt::{self, Display};
use uuid::Uuid;

/// Errors that can occur while manipulating a `ChatContext`.
#[derive(Debug, PartialEq, Eq)]
pub enum ContextError {
    /// Provided message content was empty after trimming whitespace.
    EmptyMessageContent,
    /// The incoming message payload type is not yet supported.
    UnsupportedMessageType(&'static str),
    /// Additional approval is required before proceeding.
    ApprovalRequired(Uuid),
    /// Tool execution must occur before completing processing.
    ToolExecutionRequired,
    /// Errors that occur while processing streaming responses.
    StreamingError(String),
}

impl Display for ContextError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ContextError::EmptyMessageContent => write!(f, "message content cannot be empty"),
            ContextError::UnsupportedMessageType(kind) => {
                write!(f, "unsupported message type: {kind}")
            }
            ContextError::ApprovalRequired(request_id) => {
                write!(f, "approval required for request {request_id}")
            }
            ContextError::ToolExecutionRequired => {
                write!(f, "pending tool execution required to continue")
            }
            ContextError::StreamingError(err) => {
                write!(f, "streaming error: {err}")
            }
        }
    }
}

impl Error for ContextError {}
