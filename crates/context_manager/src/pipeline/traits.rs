//! Message Processor Trait
//!
//! This module defines the core trait that all message processors must implement.

use super::context::ProcessingContext;
use super::error::ProcessError;
use super::result::ProcessResult;

/// Message Processor Trait
///
/// All processors in the pipeline must implement this trait.
/// Each processor receives a mutable `ProcessingContext` and can:
/// - Validate the message
/// - Transform the message
/// - Add metadata
/// - Abort the pipeline
/// - Request suspension (e.g., for user approval)
///
/// # Example
///
/// ```no_run
/// use context_manager::pipeline::{MessageProcessor, ProcessingContext, ProcessResult, ProcessError};
///
/// struct MyProcessor;
///
/// impl MessageProcessor for MyProcessor {
///     fn name(&self) -> &str {
///         "my_processor"
///     }
///
///     fn process(&self, ctx: &mut ProcessingContext) -> Result<ProcessResult, ProcessError> {
///         // Validate message
///         if ctx.message.content.is_none() {
///             return Ok(ProcessResult::Abort {
///                 reason: "Empty message".to_string()
///             });
///         }
///         Ok(ProcessResult::Continue)
///     }
/// }
/// ```
pub trait MessageProcessor: Send + Sync {
    /// Returns the name of this processor (for logging and debugging)
    fn name(&self) -> &str;

    /// Process the message
    ///
    /// # Arguments
    ///
    /// * `ctx` - Mutable processing context containing the message, chat_context, and metadata
    ///
    /// # Returns
    ///
    /// - `Ok(ProcessResult)` - Processing result (Continue, Transform, Abort, Suspend)
    /// - `Err(ProcessError)` - Processing error
    fn process<'a>(&self, ctx: &mut ProcessingContext<'a>) -> Result<ProcessResult, ProcessError>;

    /// Check if this processor should run
    ///
    /// This allows conditional execution of processors based on the context.
    /// Default implementation always returns true.
    ///
    /// # Arguments
    ///
    /// * `ctx` - Processing context (immutable)
    ///
    /// # Returns
    ///
    /// `true` if the processor should run, `false` to skip
    fn should_run<'a>(&self, _ctx: &ProcessingContext<'a>) -> bool {
        true
    }
}

