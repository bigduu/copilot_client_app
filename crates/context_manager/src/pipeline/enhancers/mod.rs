//! System Prompt Enhancers
//!
//! Enhancers are plugins that add content to the system prompt.
//! They are managed by SystemPromptProcessor and run in a specific order
//! based on their priority values.
//!
//! # Architecture
//!
//! - `PromptEnhancer` trait: Interface for all enhancers
//! - Each enhancer can inspect the ProcessingContext and decide whether to add content
//! - Enhancers return `Option<PromptFragment>` - None means skip this enhancer
//! - Priority determines the order in which fragments appear in the final prompt
//!
//! # Available Enhancers
//!
//! - `RoleContextEnhancer`: Adds current active role information (priority: 90)
//! - `ToolEnhancementEnhancer`: Adds available tool definitions (priority: 60)
//! - `MermaidEnhancementEnhancer`: Adds Mermaid diagram guidelines (priority: 50)
//! - `ContextHintsEnhancer`: Adds context hints about files and tools (priority: 40)

use crate::pipeline::context::{ProcessingContext, PromptFragment};

/// Trait for system prompt enhancers
///
/// Enhancers are plugins that can add content to the system prompt.
/// They are executed by SystemPromptProcessor in priority order.
pub trait PromptEnhancer: Send + Sync {
    /// Name of this enhancer (for logging and debugging)
    fn name(&self) -> &str;

    /// Enhance the system prompt
    ///
    /// # Arguments
    ///
    /// * `ctx` - The processing context containing message, chat context, and collected data
    ///
    /// # Returns
    ///
    /// * `Some(PromptFragment)` - If this enhancer wants to add content
    /// * `None` - If this enhancer should be skipped (e.g., feature disabled, no content to add)
    ///
    /// # Example
    ///
    /// ```no_run
    /// use context_manager::pipeline::enhancers::PromptEnhancer;
    /// use context_manager::pipeline::context::{ProcessingContext, PromptFragment};
    ///
    /// struct MyEnhancer;
    ///
    /// impl PromptEnhancer for MyEnhancer {
    ///     fn name(&self) -> &str {
    ///         "my_enhancer"
    ///     }
    ///
    ///     fn enhance(&self, ctx: &ProcessingContext) -> Option<PromptFragment> {
    ///         Some(PromptFragment {
    ///             content: "My enhancement content".to_string(),
    ///             source: "my_enhancer".to_string(),
    ///             priority: 50,
    ///         })
    ///     }
    /// }
    /// ```
    fn enhance(&self, ctx: &ProcessingContext) -> Option<PromptFragment>;
}

pub mod context_hints;
pub mod mermaid_enhancement;
pub mod role_context;
pub mod tool_enhancement;

pub use context_hints::ContextHintsEnhancer;
pub use mermaid_enhancement::MermaidEnhancementEnhancer;
pub use role_context::RoleContextEnhancer;
pub use tool_enhancement::ToolEnhancementEnhancer;

