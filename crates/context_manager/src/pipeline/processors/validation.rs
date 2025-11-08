//! Validation Processor
//!
//! This processor validates incoming messages before further processing.

use crate::pipeline::context::ProcessingContext;
use crate::pipeline::error::ProcessError;
use crate::pipeline::result::ProcessResult;
use crate::pipeline::traits::MessageProcessor;
use crate::structs::message_types::RichMessageType;

/// Validation Processor
///
/// Validates messages to ensure they meet basic requirements:
/// - Message content is not empty (for text messages)
/// - Required fields are present
/// - Message type is valid
///
/// # Example
///
/// ```no_run
/// use context_manager::pipeline::processors::ValidationProcessor;
/// use context_manager::pipeline::MessagePipeline;
///
/// let pipeline = MessagePipeline::new()
///     .register(Box::new(ValidationProcessor::new()));
/// ```
pub struct ValidationProcessor {
    config: ValidationConfig,
}

/// Validation Configuration
#[derive(Debug, Clone)]
pub struct ValidationConfig {
    /// Allow empty text messages
    pub allow_empty_text: bool,

    /// Minimum content length (0 = no minimum)
    pub min_content_length: usize,

    /// Maximum content length (0 = no maximum)
    pub max_content_length: usize,
}

impl Default for ValidationConfig {
    fn default() -> Self {
        Self {
            allow_empty_text: false,
            min_content_length: 0,
            max_content_length: 0,
        }
    }
}

impl ValidationProcessor {
    /// Create a new validation processor with default config
    pub fn new() -> Self {
        Self {
            config: ValidationConfig::default(),
        }
    }

    /// Create a validation processor with custom config
    pub fn with_config(config: ValidationConfig) -> Self {
        Self { config }
    }

    /// Validate text content
    fn validate_text_content(&self, content: &str) -> Result<(), ProcessError> {
        // Check if empty
        if !self.config.allow_empty_text && content.trim().is_empty() {
            return Err(ProcessError::EmptyContent);
        }

        // Check minimum length
        if self.config.min_content_length > 0 && content.len() < self.config.min_content_length {
            return Err(ProcessError::ValidationFailed(format!(
                "Content too short: {} chars (minimum: {})",
                content.len(),
                self.config.min_content_length
            )));
        }

        // Check maximum length
        if self.config.max_content_length > 0 && content.len() > self.config.max_content_length {
            return Err(ProcessError::ValidationFailed(format!(
                "Content too long: {} chars (maximum: {})",
                content.len(),
                self.config.max_content_length
            )));
        }

        Ok(())
    }
}

impl Default for ValidationProcessor {
    fn default() -> Self {
        Self::new()
    }
}

impl MessageProcessor for ValidationProcessor {
    fn name(&self) -> &str {
        "validation"
    }

    fn process<'a>(&self, ctx: &mut ProcessingContext<'a>) -> Result<ProcessResult, ProcessError> {
        // Validate based on message type
        if let Some(rich_type) = &ctx.message.rich_type {
            match rich_type {
                RichMessageType::Text(text_msg) => {
                    self.validate_text_content(&text_msg.content)?;
                }

                RichMessageType::StreamingResponse(streaming_msg) => {
                    // Streaming responses should have content
                    if streaming_msg.content.is_empty() {
                        return Err(ProcessError::ValidationFailed(
                            "Streaming response has no content".to_string(),
                        ));
                    }
                }

                RichMessageType::FileReference(file_ref) => {
                    // File reference should have a valid path
                    if file_ref.path.is_empty() {
                        return Err(ProcessError::ValidationFailed(
                            "File reference has empty path".to_string(),
                        ));
                    }
                }

                RichMessageType::ToolRequest(tool_req) => {
                    // Tool request should have calls
                    if tool_req.calls.is_empty() {
                        return Err(ProcessError::ValidationFailed(
                            "Tool request has no calls".to_string(),
                        ));
                    }
                }

                // Other types are considered valid by default
                _ => {}
            }
        } else {
            // Legacy message - validate content parts
            if ctx.message.content.is_empty() {
                return Err(ProcessError::EmptyContent);
            }
        }

        // Add validation metadata
        ctx.add_metadata("validated", serde_json::json!(true));

        Ok(ProcessResult::Continue)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::structs::context::ChatContext;
    use crate::structs::message::{InternalMessage, Role};
    use crate::structs::message_types::{RichMessageType, TextMessage};
    use uuid::Uuid;

    fn create_test_context() -> ChatContext {
        ChatContext::new(
            Uuid::new_v4(),
            "test-model".to_string(),
            "test-mode".to_string(),
        )
    }

    fn create_text_message(content: &str) -> InternalMessage {
        InternalMessage {
            role: Role::User,
            content: Vec::new(),
            tool_calls: None,
            tool_result: None,
            metadata: None,
            message_type: Default::default(),
            rich_type: Some(RichMessageType::Text(TextMessage::new(content))),
        }
    }

    #[test]
    fn test_valid_text_message() {
        let processor = ValidationProcessor::new();
        let message = create_text_message("Hello, world!");
        let mut context = create_test_context();
        let mut ctx = ProcessingContext::new(message, &mut context);

        let result = processor.process(&mut ctx);
        assert!(result.is_ok());
        assert!(matches!(result.unwrap(), ProcessResult::Continue));
    }

    #[test]
    fn test_empty_text_message() {
        let processor = ValidationProcessor::new();
        let message = create_text_message("");
        let mut context = create_test_context();
        let mut ctx = ProcessingContext::new(message, &mut context);

        let result = processor.process(&mut ctx);
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), ProcessError::EmptyContent));
    }

    #[test]
    fn test_whitespace_only_message() {
        let processor = ValidationProcessor::new();
        let message = create_text_message("   \n   ");
        let mut context = create_test_context();
        let mut ctx = ProcessingContext::new(message, &mut context);

        let result = processor.process(&mut ctx);
        assert!(result.is_err());
    }

    #[test]
    fn test_min_length_validation() {
        let config = ValidationConfig {
            min_content_length: 10,
            ..Default::default()
        };
        let processor = ValidationProcessor::with_config(config);
        let message = create_text_message("short");
        let mut context = create_test_context();
        let mut ctx = ProcessingContext::new(message, &mut context);

        let result = processor.process(&mut ctx);
        assert!(result.is_err());
    }

    #[test]
    fn test_max_length_validation() {
        let config = ValidationConfig {
            max_content_length: 5,
            ..Default::default()
        };
        let processor = ValidationProcessor::with_config(config);
        let message = create_text_message("this is too long");
        let mut context = create_test_context();
        let mut ctx = ProcessingContext::new(message, &mut context);

        let result = processor.process(&mut ctx);
        assert!(result.is_err());
    }

    #[test]
    fn test_allow_empty_text() {
        let config = ValidationConfig {
            allow_empty_text: true,
            ..Default::default()
        };
        let processor = ValidationProcessor::with_config(config);
        let message = create_text_message("");
        let mut context = create_test_context();
        let mut ctx = ProcessingContext::new(message, &mut context);

        let result = processor.process(&mut ctx);
        assert!(result.is_ok());
    }
}
