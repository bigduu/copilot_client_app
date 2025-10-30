pub mod adapters;
pub mod api;
pub mod auth;
pub mod config;
pub mod utils;
pub mod client_trait;

pub use api::client::CopilotClient;
pub use client_trait::CopilotClientTrait;
pub use config::Config;
