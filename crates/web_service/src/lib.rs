pub mod controllers;
pub mod dto;
pub mod error;
pub mod middleware;
pub mod models;
pub mod server;
pub mod services;
pub mod storage;

use std::sync::Arc;
use tokio::sync::Mutex;

pub use server::WebService;

pub type WebServiceState = Arc<Mutex<WebService>>;
