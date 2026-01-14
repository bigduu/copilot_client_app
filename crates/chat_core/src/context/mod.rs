//! Context module - Context relationships and tree structure
//!
//! Manages parent-child relationships between contexts.

mod tree;

pub use tree::{ChildContextRef, ContextTree, MAX_CONTEXT_DEPTH};
