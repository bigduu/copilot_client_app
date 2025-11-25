//! Action-based API domain (FSM-driven)
//!
//! This module handles FSM-driven action-based API endpoints:
//! - Get context state (polling)
//! - Send message action (triggers full FSM flow)
//! - Approve tools action (continues FSM after approval)
//! - Update agent role
//!
//! These endpoints let the backend FSM handle all processing including:
//! - LLM responses
//! - Tool execution
//! - State management
//! - Auto-save

pub mod approve_tools;
pub mod get_state;
pub mod helpers;
pub mod send_message;
pub mod types;
pub mod update_agent_role;

// Re-export public types
pub use types::*;

// Re-export helpers
pub use helpers::{payload_preview, payload_type};

// Re-export handlers
pub use approve_tools::approve_tools_action;
pub use get_state::get_context_state;
pub use send_message::send_message_action;
pub use update_agent_role::update_agent_role as update_agent_role_handler;
