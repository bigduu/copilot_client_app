//! # Session Manager
//!
//! Manages user sessions, UI state, and preferences in the backend.
//! Provides a unified API for multi-client synchronization.

pub mod error;
pub mod storage;
pub mod structs;
pub mod manager;
pub mod multi_user_manager;

// Re-exports
pub use error::SessionError;
pub use storage::{SessionStorage, FileSessionStorage};
pub use structs::{
    UserSession, OpenContext, UIState, UserPreferences, Theme,
};
pub use manager::SessionManager;
pub use multi_user_manager::MultiUserSessionManager;

// Re-export ToolApprovalPolicy from context_manager for convenience
pub use context_manager::ToolApprovalPolicy;

