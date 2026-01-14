//! Agent Loop module - The main driver of the agent
//!
//! Orchestrates the cycle of:
//! 1. Checking context state
//! 2. Processing events
//! 3. Executing tasks (Tools/Workflows)
//! 4. Communicating with LLM
//! 5. Managing TodoLists

pub mod loop_impl;

pub use loop_impl::AgentLoop;
