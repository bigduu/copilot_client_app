pub mod auth;
pub mod client;
pub mod client_trait;
pub mod error;
pub mod masking;
pub mod models;
pub mod openai;
pub mod provider;
pub mod providers;
pub mod types;

pub mod api {
    pub mod models {
        pub use crate::models::*;
    }

    pub mod stream_tool_accumulator {
        pub use crate::client::stream_tool_accumulator::*;
    }
}

pub use auth::{CopilotAuthHandler, CopilotToken, TokenCache};
pub use chat_core::Config;
pub use client::CopilotClient;
pub use client_trait::CopilotClientTrait;
pub use error::ProxyAuthRequiredError;
pub use masking::apply_masking;
pub use models::*;
pub use openai::OpenAIProvider;
pub use provider::{LLMError, LLMProvider, LLMStream};
pub use providers::CopilotProvider;
pub use types::LLMChunk;
