//! Categories Module
//!
//! This module contains all category implementations.

pub mod command_execution;
pub mod file_operations;
pub mod general_assistant;
pub mod translate;

// Re-export all categories
pub use command_execution::CommandExecutionCategory;
pub use file_operations::FileOperationsCategory;
pub use general_assistant::GeneralAssistantCategory;
pub use translate::TranslateCategory;
