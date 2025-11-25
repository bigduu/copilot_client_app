//! Context lifecycle management domain
//!
//! This module handles CRUD operations for contexts:
//! - Creating new contexts
//! - Reading/fetching contexts  
//! - Updating context configuration
//! - Deleting contexts
//! - Listing all contexts
//! - Getting context metadata
//!
//! The module is organized by operation type for better maintainability.

pub mod create;
pub mod delete;
pub mod query;
pub mod types;
pub mod update;

// Re-export public types
pub use types::*;

// Re-export handlers
pub use create::create_context;
pub use delete::delete_context;
pub use query::{get_context, get_context_metadata, list_contexts};
pub use update::{update_context, update_context_config};
