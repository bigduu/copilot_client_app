pub mod config;
pub mod controllers;
pub mod dto;
pub mod error;
pub mod middleware;
pub mod models;
pub mod server;
pub mod services;
pub mod storage;

// Re-export commonly used services for backward compatibility
pub use services::workspace_service;

use std::sync::Arc;
use tokio::sync::Mutex;

pub use server::WebService;

pub type WebServiceState = Arc<Mutex<WebService>>;
