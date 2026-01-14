//! Agent module - Role and permission types
//!
//! Defines agent roles and their scopes for sub-tasks.

mod role;
mod scope;

pub use role::{AgentRole, Permission};
pub use scope::SubTaskScope;
