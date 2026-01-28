pub mod api;
pub mod auth;
pub mod model;
pub mod utils;

// Re-export key public structs/enums if needed, for easier access from outside crate::copilot::
// For example, if CopilotClient is intended to be used as crate::copilot::CopilotClient
pub use api::client::CopilotClient;
pub use chat_core::Config;
pub use model::stream_model::{Message, StreamChunk}; // Example re-export // Assuming Config is public and used directly from copilot module
