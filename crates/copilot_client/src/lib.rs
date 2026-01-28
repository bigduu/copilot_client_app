pub mod api;
pub mod auth;
pub mod client_trait;
pub mod utils;

pub use api::client::CopilotClient;
pub use client_trait::CopilotClientTrait;
pub use chat_core::Config;
