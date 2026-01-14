//! chat_state - State machine and FSM logic for chat contexts
//!
//! This crate provides the state machine implementation for managing
//! chat context lifecycle, including TODO-aware states.

pub mod machine;

// Re-export commonly used types
pub use machine::{ChatEvent, ContextState, StateMachine, StateTransition, TransitionError};
