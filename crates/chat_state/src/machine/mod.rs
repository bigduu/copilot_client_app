//! State machine module
//!
//! Contains the FSM implementation for chat context lifecycle.

mod events;
mod states;
mod transitions;

pub use events::ChatEvent;
pub use states::ContextState;
pub use transitions::{StateMachine, StateTransition, TransitionError};
