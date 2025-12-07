//! Context lifecycle management
//!
//! This module contains all lifecycle-related methods for ChatContext,
//! organized by responsibility:
//!
//! - **state**: State management, dirty flags, trace IDs, and FSM transitions
//! - **streaming**: Streaming response handling with chunk tracking
//! - **auto_loop**: Automatic tool execution loop management  
//! - **pipeline**: Message pipeline processing and configuration
//!
//! ## Module Organization
//!
//! This module was refactored from a 965-line monolithic file into focused
//! sub-modules for better maintainability and clarity.

mod auto_loop;
mod pipeline;
mod state;
mod streaming;

// Re-export all public items to maintain API compatibility
