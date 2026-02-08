//! Anthropic API Adapter
//!
//! Provides conversion between Anthropic API and OpenAI API formats.
//! Supports capability-based model mapping (background, thinking, long_context, default).

pub mod conversion;
pub mod model_mapping;
pub mod models;

// Re-export from models
pub use models::{
    AnthropicCompleteRequest, AnthropicCompleteResponse, AnthropicContent, AnthropicContentBlock,
    AnthropicError, AnthropicErrorDetail, AnthropicErrorEnvelope, AnthropicMessage,
    AnthropicMessagesRequest, AnthropicMessagesResponse, AnthropicResponseContentBlock,
    AnthropicRole, AnthropicSystem, AnthropicSystemBlock, AnthropicTool, AnthropicToolChoice,
    AnthropicUsage,
};

// Re-export from model_mapping (includes ModelResolution)
pub use model_mapping::{
    default_openai_model, resolve_model, CapabilityModelMapping, ModelCapability,
    ModelMappingError, ModelResolution,
};

// Re-export from conversion
pub use conversion::{
    convert_complete_request, convert_complete_response, convert_messages_request,
    convert_messages_response, create_error_response, extract_text_content,
};
