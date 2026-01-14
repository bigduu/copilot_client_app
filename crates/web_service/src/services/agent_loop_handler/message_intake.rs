//! Message intake phase - Payload handling and delegation

use crate::{
    error::AppError,
    models::{ClientMessageMetadata, FinalizedMessage, MessagePayload, ServiceResponse},
    services::message_processing::{
            FileReferenceHandler, TextMessageHandler, ToolResultHandler, WorkflowHandler,
        },
    storage::StorageProvider,
};
use context_manager::ChatContext;
use std::{collections::HashMap, sync::Arc};
use tokio::sync::RwLock;
use uuid::Uuid;

/// Execute file reference: read files or list directories
pub(super) async fn execute_file_reference<T: StorageProvider>(
    file_reference_handler: &FileReferenceHandler<T>,
    context: &Arc<RwLock<ChatContext>>,
    paths: &[String],
    display_text: &str,
    metadata: &ClientMessageMetadata,
) -> Result<(), AppError> {
    file_reference_handler
        .handle(context, paths, display_text, metadata)
        .await
}

/// Execute workflow
pub(super) async fn execute_workflow<T: StorageProvider>(
    workflow_handler: &WorkflowHandler<T>,
    context: &Arc<RwLock<ChatContext>>,
    workflow: &str,
    parameters: &HashMap<String, serde_json::Value>,
    display_text: &str,
    metadata: &ClientMessageMetadata,
) -> Result<FinalizedMessage, AppError> {
    let (message_id, summary, sequence) = workflow_handler
        .handle(context, workflow, parameters, display_text, metadata)
        .await?;

    Ok(FinalizedMessage {
        message_id,
        sequence,
        summary,
    })
}

/// Record tool result message
pub(super) async fn record_tool_result_message<T: StorageProvider>(
    tool_result_handler: &ToolResultHandler<T>,
    context: &Arc<RwLock<ChatContext>>,
    tool_name: &str,
    result: serde_json::Value,
    display_text: &str,
    metadata: &ClientMessageMetadata,
) -> Result<FinalizedMessage, AppError> {
    let (message_id, summary, sequence) = tool_result_handler
        .handle(context, tool_name, result, display_text, metadata)
        .await?;

    Ok(FinalizedMessage {
        message_id,
        sequence,
        summary,
    })
}

/// Handle text message
pub(super) async fn handle_text_message<T: StorageProvider>(
    text_message_handler: &TextMessageHandler<T>,
    context: &Arc<RwLock<ChatContext>>,
    content: &str,
    display: Option<&str>,
    metadata: &ClientMessageMetadata,
) -> Result<(), AppError> {
    text_message_handler
        .handle(context, content, display, metadata)
        .await
}

/// Handle incoming request payload - dispatcher for different message types
pub(super) async fn handle_request_payload<T: StorageProvider>(
    file_reference_handler: &FileReferenceHandler<T>,
    workflow_handler: &WorkflowHandler<T>,
    tool_result_handler: &ToolResultHandler<T>,
    text_message_handler: &TextMessageHandler<T>,
    context: &Arc<RwLock<ChatContext>>,
    _context_id: Uuid,
    payload: &MessagePayload,
    display_text: &str,
    metadata: &ClientMessageMetadata,
) -> Result<Option<ServiceResponse>, AppError> {
    match payload {
        MessagePayload::FileReference { paths, .. } => {
            execute_file_reference(
                file_reference_handler,
                context,
                paths,
                display_text,
                metadata,
            )
            .await?;
            Ok(None)
        }
        MessagePayload::Workflow {
            workflow,
            parameters,
            ..
        } => {
            // For markdown workflows (new system), treat as text message
            // The workflow content should be in display_text
            // Let LLM process the workflow instructions
            if parameters.is_empty() {
                // New markdown workflow system - pass workflow content to LLM
                tracing::info!(
                    "Processing markdown workflow '{}' as text message",
                    workflow
                );
                handle_text_message(
                    text_message_handler,
                    context,
                    display_text, // Use display_text which contains workflow content
                    Some(display_text),
                    metadata,
                )
                .await?;
                Ok(None) // Continue to agent loop
            } else {
                // Old workflow system with parameters - execute workflow
                tracing::info!("Executing legacy workflow '{}' with parameters", workflow);
                let finalized = execute_workflow(
                    workflow_handler,
                    context,
                    workflow,
                    parameters,
                    display_text,
                    metadata,
                )
                .await?;
                Ok(Some(ServiceResponse::FinalMessage(finalized.summary)))
            }
        }
        MessagePayload::ToolResult {
            tool_name, result, ..
        } => {
            let finalized = record_tool_result_message(
                tool_result_handler,
                context,
                tool_name,
                result.clone(),
                display_text,
                metadata,
            )
            .await?;
            Ok(Some(ServiceResponse::FinalMessage(finalized.summary)))
        }
        MessagePayload::Text { content, display } => {
            handle_text_message(
                text_message_handler,
                context,
                content,
                display.as_deref(),
                metadata,
            )
            .await?;
            Ok(None)
        }
    }
}
