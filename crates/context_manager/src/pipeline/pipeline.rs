//! Message Pipeline Implementation
//!
//! This module implements the core pipeline that orchestrates message processing.

use super::context::ProcessingContext;
use super::error::PipelineError;
use super::result::{PipelineOutput, ProcessResult, ProcessingState};
use super::traits::MessageProcessor;
use crate::structs::message::InternalMessage;
use std::time::Instant;

/// Message Pipeline
///
/// Orchestrates message processing through a series of processors.
///
/// # Example
///
/// ```no_run
/// use context_manager::pipeline::{MessagePipeline, processors::ValidationProcessor};
///
/// let pipeline = MessagePipeline::new()
///     .register(Box::new(ValidationProcessor::new()));
///
/// // Execute pipeline
/// // let output = pipeline.execute(message).await?;
/// ```
pub struct MessagePipeline {
    /// Registered processors (executed in order)
    processors: Vec<Box<dyn MessageProcessor>>,

    /// Pipeline configuration
    config: PipelineConfig,
}

/// Pipeline Configuration
#[derive(Debug, Clone)]
pub struct PipelineConfig {
    /// Enable timing statistics
    pub enable_timing: bool,

    /// Enable detailed logging
    pub enable_logging: bool,

    /// Maximum processing time in milliseconds (0 = no limit)
    pub max_processing_time_ms: u64,
}

impl Default for PipelineConfig {
    fn default() -> Self {
        Self {
            enable_timing: true,
            enable_logging: false,
            max_processing_time_ms: 0,
        }
    }
}

impl MessagePipeline {
    /// Create a new empty pipeline
    pub fn new() -> Self {
        Self {
            processors: Vec::new(),
            config: PipelineConfig::default(),
        }
    }

    /// Create a pipeline with custom configuration
    pub fn with_config(config: PipelineConfig) -> Self {
        Self {
            processors: Vec::new(),
            config,
        }
    }

    /// Register a processor (chainable)
    ///
    /// Processors are executed in the order they are registered.
    ///
    /// # Example
    ///
    /// ```no_run
    /// use context_manager::pipeline::{MessagePipeline, processors::*};
    ///
    /// let pipeline = MessagePipeline::new()
    ///     .register(Box::new(ValidationProcessor::new()))
    ///     .register(Box::new(FileReferenceProcessor::new()));
    /// ```
    pub fn register(mut self, processor: Box<dyn MessageProcessor>) -> Self {
        self.processors.push(processor);
        self
    }

    /// Execute the pipeline on a message
    ///
    /// # Arguments
    ///
    /// * `message` - The message to process
    ///
    /// # Returns
    ///
    /// - `Ok(PipelineOutput)` - Processing completed, suspended, or aborted
    /// - `Err(PipelineError)` - An error occurred during processing
    ///
    /// # Example
    ///
    /// ```no_run
    /// use context_manager::pipeline::{MessagePipeline, PipelineOutput};
    /// use context_manager::structs::message::InternalMessage;
    ///
    /// async fn process_message(pipeline: &MessagePipeline, message: InternalMessage) {
    ///     match pipeline.execute(message).await {
    ///         Ok(PipelineOutput::Completed { message, metadata, stats }) => {
    ///             println!("Processed: {} processors in {}ms",
    ///                      stats.processors_run,
    ///                      stats.total_duration_ms);
    ///         }
    ///         Ok(PipelineOutput::Aborted { reason, .. }) => {
    ///             eprintln!("Aborted: {}", reason);
    ///         }
    ///         Err(e) => {
    ///             eprintln!("Error: {}", e);
    ///         }
    ///         _ => {}
    ///     }
    /// }
    /// ```
    pub async fn execute(
        &self,
        message: InternalMessage,
        chat_context: &mut crate::structs::context::ChatContext,
    ) -> Result<PipelineOutput, PipelineError> {
        if self.processors.is_empty() {
            return Err(PipelineError::NoProcessors);
        }

        let pipeline_start = Instant::now();
        let mut ctx = ProcessingContext::new(message, chat_context);

        // Execute each processor
        for (index, processor) in self.processors.iter().enumerate() {
            // Check if processor should run
            if !processor.should_run(&ctx) {
                if self.config.enable_logging {
                    log::debug!("Skipping processor: {}", processor.name());
                }
                continue;
            }

            // Time the processor
            let start = Instant::now();

            if self.config.enable_logging {
                log::debug!("Running processor: {}", processor.name());
            }

            // Execute processor
            let result = processor.process(&mut ctx).map_err(|error| {
                PipelineError::ProcessorFailed {
                    processor: processor.name().to_string(),
                    error,
                }
            })?;

            // Record timing
            if self.config.enable_timing {
                let duration_ms = start.elapsed().as_millis() as u64;
                ctx.stats.record_processor(processor.name().to_string(), duration_ms);

                // Check timeout
                if self.config.max_processing_time_ms > 0 {
                    let total_elapsed = pipeline_start.elapsed().as_millis() as u64;
                    if total_elapsed > self.config.max_processing_time_ms {
                        return Err(PipelineError::Generic(format!(
                            "Pipeline timeout: {}ms exceeded",
                            self.config.max_processing_time_ms
                        )));
                    }
                }
            }

            // Handle result
            match result {
                ProcessResult::Continue => {
                    // Continue to next processor
                    continue;
                }

                ProcessResult::Transform(new_message) => {
                    // Update message and continue
                    ctx.message = new_message;
                    continue;
                }

                ProcessResult::Abort { reason } => {
                    // Abort pipeline
                    return Ok(PipelineOutput::Aborted {
                        reason,
                        aborted_by: processor.name().to_string(),
                    });
                }

                ProcessResult::Suspend {
                    resume_token,
                    reason,
                } => {
                    // Suspend pipeline
                    let state = ProcessingState {
                        suspended_at: index,
                        message: ctx.message,
                        metadata: ctx.metadata,
                        stats: ctx.stats,
                    };
                    return Ok(PipelineOutput::Suspended {
                        resume_token,
                        reason,
                        partial_state: Box::new(state),
                    });
                }
            }
        }

        // Pipeline completed successfully
        Ok(PipelineOutput::Completed {
            message: ctx.message,
            metadata: ctx.metadata,
            stats: ctx.stats,
        })
    }

    /// Resume a suspended pipeline
    ///
    /// This allows continuing processing from where it was suspended.
    ///
    /// # Arguments
    ///
    /// * `resume_token` - The token returned when the pipeline was suspended
    /// * `state` - The partial state from suspension
    ///
    /// # Returns
    ///
    /// - `Ok(PipelineOutput)` - Processing completed or suspended again
    /// - `Err(PipelineError)` - Invalid token or error during processing
    pub async fn resume(
        &self,
        resume_token: &str,
        state: ProcessingState,
        chat_context: &mut crate::structs::context::ChatContext,
    ) -> Result<PipelineOutput, PipelineError> {
        // Validate resume token (simplified - real implementation would be more robust)
        if resume_token.is_empty() {
            return Err(PipelineError::InvalidResumeToken(
                "Empty resume token".to_string(),
            ));
        }

        let pipeline_start = Instant::now();
        let mut ctx = ProcessingContext {
            message: state.message,
            chat_context,
            metadata: state.metadata,
            file_contents: Vec::new(),
            available_tools: Vec::new(),
            prompt_fragments: Vec::new(),
            stats: state.stats,
        };

        // Resume from the next processor after suspension
        let start_index = state.suspended_at + 1;

        for (offset, processor) in self.processors[start_index..].iter().enumerate() {
            let index = start_index + offset;

            if !processor.should_run(&ctx) {
                continue;
            }

            let start = Instant::now();

            let result = processor.process(&mut ctx).map_err(|error| {
                PipelineError::ProcessorFailed {
                    processor: processor.name().to_string(),
                    error,
                }
            })?;

            if self.config.enable_timing {
                let duration_ms = start.elapsed().as_millis() as u64;
                ctx.stats.record_processor(processor.name().to_string(), duration_ms);

                if self.config.max_processing_time_ms > 0 {
                    let total_elapsed = pipeline_start.elapsed().as_millis() as u64;
                    if total_elapsed > self.config.max_processing_time_ms {
                        return Err(PipelineError::Generic(format!(
                            "Pipeline timeout: {}ms exceeded",
                            self.config.max_processing_time_ms
                        )));
                    }
                }
            }

            match result {
                ProcessResult::Continue => continue,
                ProcessResult::Transform(new_message) => {
                    ctx.message = new_message;
                    continue;
                }
                ProcessResult::Abort { reason } => {
                    return Ok(PipelineOutput::Aborted {
                        reason,
                        aborted_by: processor.name().to_string(),
                    });
                }
                ProcessResult::Suspend {
                    resume_token,
                    reason,
                } => {
                    let state = ProcessingState {
                        suspended_at: index,
                        message: ctx.message,
                        metadata: ctx.metadata,
                        stats: ctx.stats,
                    };
                    return Ok(PipelineOutput::Suspended {
                        resume_token,
                        reason,
                        partial_state: Box::new(state),
                    });
                }
            }
        }

        Ok(PipelineOutput::Completed {
            message: ctx.message,
            metadata: ctx.metadata,
            stats: ctx.stats,
        })
    }

    /// Get the number of registered processors
    pub fn processor_count(&self) -> usize {
        self.processors.len()
    }

    /// Check if pipeline is empty
    pub fn is_empty(&self) -> bool {
        self.processors.is_empty()
    }
}

impl Default for MessagePipeline {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pipeline::error::ProcessError;
    use crate::structs::context::ChatContext;
    use crate::structs::message::{InternalMessage, Role};
    use uuid::Uuid;

    fn create_test_context() -> ChatContext {
        ChatContext::new(Uuid::new_v4(), "test-model".to_string(), "test-mode".to_string())
    }

    // Mock processor for testing
    struct TestProcessor {
        name: String,
        result: ProcessResult,
    }

    impl TestProcessor {
        fn new(name: &str, result: ProcessResult) -> Self {
            Self {
                name: name.to_string(),
                result,
            }
        }
    }

    impl MessageProcessor for TestProcessor {
        fn name(&self) -> &str {
            &self.name
        }

        fn process<'a>(&self, _ctx: &mut ProcessingContext<'a>) -> Result<ProcessResult, ProcessError> {
            Ok(match &self.result {
                ProcessResult::Continue => ProcessResult::Continue,
                ProcessResult::Abort { reason } => ProcessResult::Abort {
                    reason: reason.clone(),
                },
                _ => ProcessResult::Continue,
            })
        }
    }

    fn create_test_message() -> InternalMessage {
        use crate::structs::message_types::{RichMessageType, TextMessage};
        InternalMessage {
            role: Role::User,
            content: Vec::new(),
            tool_calls: None,
            tool_result: None,
            metadata: None,
            message_type: Default::default(),
            rich_type: Some(RichMessageType::Text(TextMessage::new("Test message"))),
        }
    }

    #[tokio::test]
    async fn test_empty_pipeline() {
        let pipeline = MessagePipeline::new();
        let message = create_test_message();
        let mut context = create_test_context();

        let result = pipeline.execute(message, &mut context).await;
        assert!(matches!(result, Err(PipelineError::NoProcessors)));
    }

    #[tokio::test]
    async fn test_single_processor_continue() {
        let pipeline = MessagePipeline::new().register(Box::new(TestProcessor::new(
            "test",
            ProcessResult::Continue,
        )));

        let message = create_test_message();
        let mut context = create_test_context();
        let result = pipeline.execute(message, &mut context).await;

        assert!(matches!(result, Ok(PipelineOutput::Completed { .. })));
    }

    #[tokio::test]
    async fn test_pipeline_abort() {
        let pipeline = MessagePipeline::new()
            .register(Box::new(TestProcessor::new(
                "processor1",
                ProcessResult::Continue,
            )))
            .register(Box::new(TestProcessor::new(
                "processor2",
                ProcessResult::Abort {
                    reason: "Test abort".to_string(),
                },
            )))
            .register(Box::new(TestProcessor::new(
                "processor3",
                ProcessResult::Continue,
            )));

        let message = create_test_message();
        let mut context = create_test_context();
        let result = pipeline.execute(message, &mut context).await.unwrap();

        match result {
            PipelineOutput::Aborted { reason, aborted_by } => {
                assert_eq!(reason, "Test abort");
                assert_eq!(aborted_by, "processor2");
            }
            _ => panic!("Expected Aborted output"),
        }
    }

    #[tokio::test]
    async fn test_processor_count() {
        let pipeline = MessagePipeline::new()
            .register(Box::new(TestProcessor::new(
                "p1",
                ProcessResult::Continue,
            )))
            .register(Box::new(TestProcessor::new(
                "p2",
                ProcessResult::Continue,
            )));

        assert_eq!(pipeline.processor_count(), 2);
    }
}

