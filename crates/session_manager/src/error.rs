//! Session manager error types

use thiserror::Error;

#[derive(Error, Debug)]
pub enum SessionError {
    #[error("Session not found")]
    NotFound,
    
    #[error("Storage error: {0}")]
    StorageError(String),
    
    #[error("Validation error: {0}")]
    Validation(String),
    
    #[error("Serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),
    
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    
    #[error("Invalid session data: {0}")]
    InvalidData(String),
    
    #[error("Context not found: {0}")]
    ContextNotFound(uuid::Uuid),
}

pub type Result<T> = std::result::Result<T, SessionError>;

