pub mod controllers;
pub mod error;
pub mod server;
pub mod services;

use std::sync::Arc;
use tokio::sync::Mutex;

pub use server::WebService;

pub type WebServiceState = Arc<Mutex<WebService>>;
