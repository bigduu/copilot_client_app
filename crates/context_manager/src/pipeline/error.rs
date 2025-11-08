//! Pipeline Errors
//!
//! This module defines error types for the message processing pipeline.

use std::io;
use thiserror::Error;

/// Process Error
///
/// Errors that can occur during message processing by a single processor.
#[derive(Debug, Error)]
pub enum ProcessError {
    /// Validation failed
    #[error("Validation failed: {0}")]
    ValidationFailed(String),

    /// File operation error
    #[error("File error: {0}")]
    FileError(#[from] io::Error),

    /// Message content is empty
    #[error("Message content is empty")]
    EmptyContent,

    /// Invalid message format
    #[error("Invalid message format: {0}")]
    InvalidFormat(String),

    /// File not found
    #[error("File not found: {0}")]
    FileNotFound(String),

    /// File too large
    #[error("File too large: {path} ({size} bytes, max: {max} bytes)")]
    FileTooLarge {
        path: String,
        size: usize,
        max: usize,
    },

    /// Permission denied
    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    /// Serialization error
    #[error("Serialization error: {0}")]
    SerializationError(String),

    /// Generic processing error
    #[error("Processing error: {0}")]
    Generic(String),
}

/// Pipeline Error
///
/// Errors that can occur during pipeline execution.
#[derive(Debug, Error)]
pub enum PipelineError {
    /// Pipeline was aborted by a processor
    #[error("Pipeline aborted by {processor}: {reason}")]
    Aborted { processor: String, reason: String },

    /// A processor failed
    #[error("Processor '{processor}' failed: {error}")]
    ProcessorFailed {
        processor: String,
        #[source]
        error: ProcessError,
    },

    /// No processors registered
    #[error("No processors registered in pipeline")]
    NoProcessors,

    /// Invalid resume token
    #[error("Invalid resume token: {0}")]
    InvalidResumeToken(String),

    /// Pipeline is not suspended
    #[error("Pipeline is not suspended, cannot resume")]
    NotSuspended,

    /// Context error
    #[error("Context error: {0}")]
    ContextError(String),

    /// Generic pipeline error
    #[error("Pipeline error: {0}")]
    Generic(String),
}

impl From<ProcessError> for PipelineError {
    fn from(err: ProcessError) -> Self {
        PipelineError::Generic(err.to_string())
    }
}

