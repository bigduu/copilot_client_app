//! Registration system for tools and categories
//!
//! Provides a simple global MAP-based registration system using inventory.

pub mod macros;
pub mod registries;

// Re-export for convenience
pub use macros::*;
pub use registries::*;
