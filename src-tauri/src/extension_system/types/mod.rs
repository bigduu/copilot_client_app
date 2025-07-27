//! Unified type definitions for the extension system
//!
//! This module contains all shared types to eliminate duplication between
//! category.rs and tool_types.rs from the old architecture.

pub mod tool;
pub mod category;
pub mod common;

// Re-export all types for convenience
pub use tool::*;
pub use category::*;
pub use common::*;
