//! agent_orchestrator - Orchestrates agent execution
//!
//! This crate is the heart of the agent system, responsible for:
//! - Managing TodoLists and their lifecycle (`todo_manager`)
//! - Executing different types of tasks (`executor`)
//! - Running the main agent loop (`loop`)
//! - Preparing requests and processing responses (`pipeline`)

pub mod agent_loop;
pub mod executor;
pub mod pipeline;
pub mod todo_manager;

// Re-exports
pub use agent_loop::AgentLoop;
pub use todo_manager::TodoManager;
