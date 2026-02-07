pub mod api;
pub mod auth;
pub mod client_trait;
pub mod error;
pub mod masking;
pub mod utils;

pub use api::client::CopilotClient;
pub use chat_core::Config;
pub use client_trait::CopilotClientTrait;
pub use error::ProxyAuthRequiredError;
pub use masking::apply_masking;
