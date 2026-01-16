//! Context controller - organized by functional domains
//!
//! This module is organized by business domains (features), not technical layers.
//! Each domain module contains everything related to that feature:
//! - Types/DTOs specific to that domain
//! - HTTP handlers for that domain
//! - Helper functions specific to that domain
//!
//! Domain modules:
//! - `context_lifecycle` - CRUD operations for contexts (create, read, update, delete, list, config)
//! - `workspace` - Workspace management (attach workspace, list files)
//! - `messages` - Message retrieval and querying
//! - `title_generation` - Title generation and auto-generation
//! - `streaming` - SSE events and streaming content
//! - `actions` - FSM-driven action-based API endpoints

pub mod actions;
pub mod context_lifecycle; // Domain: Context CRUD
pub mod messages; // Domain: Message operations
pub mod streaming; // Domain: SSE and streaming
pub mod title_generation; // Domain: Title generation (refactored - no duplication!)
pub mod types; // Shared types across domains (if needed)
mod workspace; // Domain: Workspace management

pub use workspace::{get_context_workspace, list_workspace_files, set_context_workspace};

use actix_web::web;

/// Configure all context-related routes
pub fn config(cfg: &mut web::ServiceConfig) {
    cfg
        // Context lifecycle domain - CRUD operations
        .service(context_lifecycle::create_context)
        .service(context_lifecycle::get_context)
        .service(context_lifecycle::get_context_metadata)
        .service(context_lifecycle::list_contexts)
        .service(context_lifecycle::update_context)
        .service(context_lifecycle::update_context_config)
        .service(context_lifecycle::delete_context)
        // Workspace domain
        .service(workspace::set_context_workspace)
        .service(workspace::get_context_workspace)
        .service(workspace::list_workspace_files)
        // Title generation domain
        .service(title_generation::generate_context_title)
        // Messages domain
        .service(messages::get_context_messages)
        .service(messages::get_message_content)
        // Streaming domain
        .service(streaming::get_streaming_chunks)
        .service(streaming::subscribe_context_events)
        // Actions domain - FSM-driven endpoints
        .service(actions::send_message_action)
        .service(actions::approve_tools_action)
        .service(actions::get_context_state)
        .service(actions::update_agent_role_handler);
}
