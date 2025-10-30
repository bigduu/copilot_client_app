use actix_web::{http::StatusCode, HttpResponse, ResponseError};
use serde::Serialize;
use thiserror::Error;

pub type Result<T, E = AppError> = std::result::Result<T, E>;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Tool '{0}' not found")]
    ToolNotFound(String),

    #[error("Tool execution failed: {0}")]
    ToolExecutionError(String),

    #[error("Internal server error: {0}")]
    InternalError(#[from] anyhow::Error),

    #[error("Storage error: {0}")]
    StorageError(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),
}

#[derive(Serialize)]
struct JsonError {
    message: String,
    r#type: String,
}

#[derive(Serialize)]
struct JsonErrorWrapper {
    error: JsonError,
}

impl ResponseError for AppError {
    fn status_code(&self) -> StatusCode {
        match self {
            AppError::ToolNotFound(_) => StatusCode::NOT_FOUND,
            AppError::ToolExecutionError(_) => StatusCode::BAD_REQUEST,
            AppError::InternalError(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::StorageError(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::SerializationError(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn error_response(&self) -> HttpResponse {
        let status_code = self.status_code();
        let error_response = JsonErrorWrapper {
            error: JsonError {
                message: self.to_string(),
                r#type: "api_error".to_string(),
            },
        };
        HttpResponse::build(status_code).json(error_response)
    }
}
