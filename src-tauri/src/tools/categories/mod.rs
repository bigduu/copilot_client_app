//! Tool Categories Module
//!
//! This module contains all tool category implementations, each implementing the new Category trait.
//! Categories are responsible for managing permission control and tool organization.

pub mod command_execution;
pub mod file_operations;
pub mod general_assistant;

// Re-export all categories
pub use command_execution::CommandExecutionCategory;
pub use file_operations::FileOperationsCategory;
pub use general_assistant::GeneralAssistantCategory;

/// Convenience function to register all default categories
///
/// This function provides a simple way to get all predefined category instances
pub fn get_default_categories() -> Vec<Box<dyn crate::tools::category::Category>> {
    vec![
        Box::new(FileOperationsCategory::new()),
        Box::new(CommandExecutionCategory::new()),
        Box::new(GeneralAssistantCategory::new()),
    ]
}
