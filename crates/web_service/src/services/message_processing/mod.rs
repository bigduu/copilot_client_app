//! Message processing handlers
//!
//! This module contains specialized handlers for different types of message processing.
//! Each handler is responsible for a single type of message or operation:
//!
//! - `FileReferenceHandler`: Processes file and directory references
//! - `WorkflowHandler`: Executes workflows
//! - `ToolResultHandler`: Records tool execution results
//! - `TextMessageHandler`: Processes plain text messages
//!
//! This design follows the Single Responsibility Principle, making each handler
//! easier to test, maintain, and reason about.

pub mod file_reference_handler;
pub mod tool_result_handler;
pub mod text_message_handler;
pub mod workflow_handler;

pub use file_reference_handler::FileReferenceHandler;
pub use tool_result_handler::ToolResultHandler;
pub use text_message_handler::TextMessageHandler;
pub use workflow_handler::WorkflowHandler;
