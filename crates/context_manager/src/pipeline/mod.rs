//! Message Processing Pipeline
//!
//! This module implements a flexible, extensible pipeline for processing incoming messages.
//! The pipeline allows for modular processing steps (processors) that can validate, transform,
//! and enhance messages before they are sent to the LLM.
//!
//! # Architecture
//!
//! ```text
//! User Message → [Validation] → [FileReference] → [ToolEnhancement] → [SystemPrompt] → LLM
//!                ↓              ↓                  ↓                    ↓
//!              验证失败?      解析文件引用        注入工具定义        动态 Prompt
//! ```
//!
//! # Example
//!
//! ```no_run
//! use context_manager::pipeline::{MessagePipeline, ProcessingContext};
//! use context_manager::pipeline::processors::{ValidationProcessor, FileReferenceProcessor};
//!
//! let pipeline = MessagePipeline::new()
//!     .register(Box::new(ValidationProcessor::new()))
//!     .register(Box::new(FileReferenceProcessor::new()));
//!
//! // Execute pipeline on a message
//! // let output = pipeline.execute(message, &mut context).await?;
//! ```

pub mod context;
pub mod error;
pub mod pipeline;
pub mod processors;
pub mod result;
pub mod traits;

// Re-exports for convenience
pub use context::ProcessingContext;
pub use error::{PipelineError, ProcessError};
pub use pipeline::MessagePipeline;
pub use result::{ProcessResult, PipelineOutput};
pub use traits::MessageProcessor;

