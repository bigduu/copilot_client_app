//! Message pipeline processing for ChatContext
//!
//! This module handles message processing through the pipeline architecture:
//! - Building configured pipelines
//! - Processing messages
//! - Pipeline integration

use crate::error::ContextError;
use crate::structs::context::ChatContext;
use crate::structs::message::{
    ContentPart, IncomingTextMessage, InternalMessage, MessageType, Role,
};
use std::collections::HashMap;

impl ChatContext {
    /// Build a message processing pipeline configured for this context
    ///
    /// The pipeline is built dynamically based on the context's configuration:
    /// - ValidationProcessor: Always included to validate incoming messages
    /// - FileReferenceProcessor: Included if workspace_path is configured
    /// - ToolEnhancementProcessor: Included to inject tool definitions
    /// - RoleContextProcessor: Injects current active agent role
    /// - SystemPromptProcessor: Included to assemble the final system prompt
    fn build_message_pipeline(&self) -> crate::pipeline::pipeline::MessagePipeline {
        use crate::pipeline::pipeline::MessagePipeline;
        use crate::pipeline::processors::*;

        let mut pipeline = MessagePipeline::new();

        // 1. Validation (always first)
        pipeline = pipeline.register(Box::new(validation::ValidationProcessor::new()));

        // 2. File Reference Processing (if workspace is configured)
        if let Some(workspace_path) = &self.config.workspace_path {
            pipeline = pipeline.register(Box::new(file_reference::FileReferenceProcessor::new(
                workspace_path,
            )));
        }

        // 3. System Prompt Assembly (always last)
        // Uses internal enhancer pipeline for modular prompt construction:
        // - RoleContextEnhancer: Injects current active agent role
        // - ToolEnhancementEnhancer: Injects tool definitions
        // - MermaidEnhancementEnhancer: Adds Mermaid diagram guidelines (if enabled)
        // - ContextHintsEnhancer: Adds context hints (file and tool counts)
        // TODO: Phase 2.x - Get actual system prompt content from SystemPromptService
        let base_prompt = "You are a helpful AI assistant.".to_string();
        pipeline = pipeline.register(Box::new(
            system_prompt::SystemPromptProcessor::with_default_enhancers(base_prompt),
        ));

        pipeline
    }

    /// Process a text message through the new Pipeline architecture (Phase 2.0)
    ///
    /// This method:
    /// 1. Creates an InternalMessage from the incoming text
    /// 2. Runs it through the configured pipeline
    /// 3. Returns the processed message and metadata
    ///
    /// # Arguments
    /// * `payload` - The incoming text message to process
    ///
    /// # Returns
    /// * `Ok((InternalMessage, metadata))` - The processed message and its metadata
    /// * `Err(ContextError)` - If processing fails
    pub async fn process_message_with_pipeline(
        &mut self,
        payload: &IncomingTextMessage,
    ) -> Result<(InternalMessage, HashMap<String, serde_json::Value>), ContextError> {
        use crate::pipeline::result::PipelineOutput;
        use crate::structs::message_types::{RichMessageType, TextMessage};

        // Create the internal message from the payload
        let mut internal_message = InternalMessage {
            role: Role::User,
            content: vec![ContentPart::text_owned(payload.content.clone())],
            message_type: MessageType::Text,
            rich_type: Some(RichMessageType::Text(TextMessage::new(
                payload.content.clone(),
            ))),
            ..Default::default()
        };

        // Apply metadata if provided
        if let Some(metadata) = &payload.metadata {
            internal_message.metadata = Some(metadata.clone());
        }

        // Build and execute the pipeline
        let pipeline = self.build_message_pipeline();
        let output = pipeline
            .execute(internal_message, self)
            .await
            .map_err(|e| ContextError::PipelineError(format!("{:?}", e)))?;

        // Handle the pipeline output
        match output {
            PipelineOutput::Completed {
                message,
                metadata,
                stats,
            } => {
                tracing::info!(
                    context_id = %self.id,
                    processors_run = stats.processors_run,
                    duration_ms = stats.total_duration_ms,
                    "Pipeline completed successfully"
                );
                Ok((message, metadata))
            }
            PipelineOutput::Aborted {
                reason, aborted_by, ..
            } => {
                tracing::warn!(
                    context_id = %self.id,
                    reason = %reason,
                    aborted_by = %aborted_by,
                    "Pipeline aborted"
                );
                Err(ContextError::PipelineError(format!(
                    "Pipeline aborted by {}: {}",
                    aborted_by, reason
                )))
            }
            PipelineOutput::Suspended { reason, .. } => {
                tracing::warn!(
                    context_id = %self.id,
                    reason = %reason,
                    "Pipeline suspended"
                );
                Err(ContextError::PipelineError(format!(
                    "Pipeline suspended: {}",
                    reason
                )))
            }
        }
    }
}

// Helper function
fn _format_tool_output(value: &serde_json::Value) -> String {
    if let Some(content) = value.get("content").and_then(|v| v.as_str()) {
        return content.to_string();
    }

    if let Some(message) = value.get("message").and_then(|v| v.as_str()) {
        return message.to_string();
    }

    serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string())
}
