use actix_web::{http::StatusCode, ResponseError};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Tool '{0}' not found")]
    ToolNotFound(String),

    #[error("Tool execution failed: {0}")]
    ToolExecutionError(String),

    #[error("Internal server error")]
    InternalError(#[from] anyhow::Error),
}

impl ResponseError for AppError {
    fn status_code(&self) -> StatusCode {
        match self {
            AppError::ToolNotFound(_) => StatusCode::NOT_FOUND,
            AppError::ToolExecutionError(_) => StatusCode::BAD_REQUEST,
            AppError::InternalError(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}
