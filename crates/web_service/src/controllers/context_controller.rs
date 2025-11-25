//! Context controller - organized by functional domains
//!
//! This controller has been refactored using domain-based organization.
//! Each business feature (domain) has its own module containing:
//! - Types/DTOs specific to that domain
//! - HTTP handlers for that domain  
//! - Helper functions specific to that domain
//!
//! Domain modules:
//! - `workspace` - Workspace management operations (COMPLETE)
//! - `title_generation` - Context title generation (COMPLETE)
//! - `messages` - Message retrieval and querying (COMPLETE)
//! - `streaming` - SSE events and streaming content (COMPLETE)
//! - `context_lifecycle` - Context CRUD operations (TODO: extract remaining handlers)
//! - `tool_approval` - Tool approval endpoints (TODO: extract remaining handlers)
//! - `actions` - FSM-driven action endpoints (TODO: extract remaining handlers)
//!
//! See DOMAIN_REFACTORING_GUIDE.md for details.

// Re-export all domain modules from the sibling context module
pub use super::context::*;
