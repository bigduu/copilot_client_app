//! Extension System - Simplified Architecture
//!
//! This module provides a clean, simple extension system with:
//! - Two global MAPs for tools and categories
//! - Simple registration mechanism
//! - Unified type definitions
//! - Single ToolsManager as the only external interface

pub mod categories;
pub mod compat;
pub mod extensions;
pub mod internal;
pub mod manager;
pub mod registry;
pub mod types;

// Import all extensions and categories to trigger registration
use crate::extension_system::categories as _categories;
use crate::extension_system::extensions as _extensions;

// Re-export the main interface
pub use manager::ToolsManager;

// Re-export types for convenience
pub use types::*;

// Re-export registration macros
pub use registry::{auto_register_category, auto_register_tool};

/// Create the default tools manager
///
/// This is the main entry point for the extension system.
/// All tools and categories (including internal ones) are automatically
/// registered and available through this manager.
pub fn create_tools_manager() -> ToolsManager {
    ToolsManager::new()
}

/// Error types for the extension system
#[derive(Debug, thiserror::Error)]
pub enum ExtensionSystemError {
    #[error("Tool '{tool_name}' not found")]
    ToolNotFound { tool_name: String },

    #[error("Category '{category_id}' not found")]
    CategoryNotFound { category_id: String },

    #[error("Tool execution failed: {message}")]
    ExecutionFailed { message: String },

    #[error("No tools registered")]
    NoTools,

    #[error("No categories registered")]
    NoCategories,
}
