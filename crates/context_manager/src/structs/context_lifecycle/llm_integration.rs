//! LLM Integration for ChatContext
//!
//! This module provides comprehensive LLM request/response lifecycle management
//! that was previously duplicated in web_service. It handles:
//! - High-level request orchestration
//! - Error recovery patterns
//! - Tool call detection helpers

use crate::structs::context::ChatContext;
use serde_json::Value as JsonValue;
use uuid::Uuid;

/// Configuration for LLM request execution
#[derive(Debug, Clone)]
pub struct LlmRequestConfig {
    /// Whether to enable streaming
    pub stream: bool,
    /// Maximum number of retries on failure
    pub max_retries: u32,
    /// Timeout in milliseconds
    pub timeout_ms: u64,
}

impl Default for LlmRequestConfig {
    fn default() -> Self {
        Self {
            stream: true,
            max_retries: 3,
            timeout_ms: 60_000, // 60 seconds
        }
    }
}

/// Result of LLM request execution
#[derive(Debug, Clone)]
pub enum LlmExecutionResult {
    /// Streaming completed successfully with final text
    StreamingComplete {
        message_id: Uuid,
        full_text: String,
    },
    /// Non-streaming request completed
    Complete { full_text: String },
    /// Request failed with error
    Failed { error: String },
    /// Tool calls detected, need to process
    ToolCallsDetected {
        tool_calls: Vec<JsonValue>,
        response_text: String,
    },
}

impl ChatContext {
    // Note: State transition methods like transition_to_awaiting_llm() are in state.rs
    // This module focuses on higher-level orchestration helpers

    /// Helper to check if context is in a state that allows LLM requests
    pub fn can_send_llm_request(&self) -> bool {
        matches!(
            self.current_state,
            crate::structs::state::ContextState::Idle
                | crate::structs::state::ContextState::ProcessingLLMResponse
        )
    }

    /// Helper to check if context is currently streaming
    pub fn is_streaming(&self) -> bool {
        matches!(
            self.current_state,
            crate::structs::state::ContextState::StreamingLLMResponse
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_can_send_llm_request_idle() {
        let ctx = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "chat".to_string());
        assert!(ctx.can_send_llm_request());
    }

    #[test]
    fn test_is_streaming() {
        let mut ctx = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "chat".to_string());
        assert!(!ctx.is_streaming());

        ctx.current_state = crate::structs::state::ContextState::StreamingLLMResponse;
        assert!(ctx.is_streaming());
    }

    #[test]
    fn test_llm_execution_result_variants() {
        let result = LlmExecutionResult::Complete {
            full_text: "test".to_string(),
        };
        assert!(matches!(result, LlmExecutionResult::Complete { .. }));
    }
}
