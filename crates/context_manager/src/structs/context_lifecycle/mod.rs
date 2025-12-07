//! Context lifecycle management
//!
//! This module contains all lifecycle-related methods for ChatContext,
//! organized by responsibility:
//!
//! - **state**: State management, dirty flags, trace IDs, and FSM transitions
//! - **streaming**: Streaming response handling with chunk tracking
//! - **auto_loop**: Automatic tool execution loop management  
//! - **pipeline**: Message pipeline processing and configuration
//! - **llm_integration**: LLM request/response lifecycle management
//!
//! ## Module Organization
//!
//! This module was refactored from a 965-line monolithic file into focused
//! sub-modules for better maintainability and clarity.

mod auto_loop;
mod llm_integration;
mod pipeline;
mod state;
mod streaming;

// Re-export public items for external use
pub use llm_integration::{LlmExecutionResult, LlmRequestConfig};
