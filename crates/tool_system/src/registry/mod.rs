//! Bean-style registration system for tools and categories
//!
//! This module provides a Spring-like factory-based registration system
//! where tools and categories explicitly register themselves in the registry.

pub mod factory;
pub mod macros;
pub mod registries;
pub mod registration;

// Re-export for convenience
pub use factory::*;
pub use registries::*;
pub use registration::*;

// Note: macros module is kept for backward compatibility but deprecated
// New code should use ToolFactory trait instead of auto_register_tool! macro
