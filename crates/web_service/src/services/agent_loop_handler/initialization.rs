//! Initialization phase - Context loading and system prompt setup

use crate::{
    error::AppError,
    models::SendMessageRequest,
    services::session_manager::ChatSessionManager,
    storage::StorageProvider,
};
use anyhow::Result;
use context_manager::{
    structs::system_prompt_snapshot::{PromptSource, SystemPromptSnapshot},
    ChatContext,
};
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

use super::super::llm_request_builder::BuiltLlmRequest;

/// Load context for incoming request
pub(super) async fn load_context_for_request<T: StorageProvider>(
    session_manager: &Arc<ChatSessionManager<T>>,
    conversation_id: Uuid,
    request: &SendMessageRequest,
) -> Result<Arc<RwLock<ChatContext>>, AppError> {
    session_manager
        .load_context(conversation_id, request.client_metadata.trace_id.clone())
        .await?
        .ok_or_else(|| {
            log::error!("Session not found: {}", conversation_id);
            AppError::NotFound("Session".to_string())
        })
}

/// Save system prompt snapshot from LLM request
pub(super) async fn save_system_prompt_from_request<T: StorageProvider>(
    session_manager: &Arc<ChatSessionManager<T>>,
    conversation_id: Uuid,
    llm_request: &BuiltLlmRequest,
) -> Result<(), AppError> {
    let mut enhanced_prompt = String::new();
    if let Some(first_msg) = llm_request.request.messages.first() {
        if first_msg.role == copilot_client::api::models::Role::System {
            if let copilot_client::api::models::Content::Text(content) = &first_msg.content {
                enhanced_prompt = content.clone();
            }
        }
    }

    if !enhanced_prompt.is_empty() {
        let source = if let Some(id) = &llm_request.prepared.system_prompt_id {
            PromptSource::Service {
                prompt_id: id.clone(),
            }
        } else {
            PromptSource::Default
        };

        let available_tools = llm_request
            .prepared
            .available_tools
            .iter()
            .map(|t| t.name.clone())
            .collect();

        let snapshot = SystemPromptSnapshot::new(
            1,
            conversation_id,
            llm_request.prepared.agent_role.clone(),
            source,
            enhanced_prompt,
            available_tools,
        );

        session_manager
            .save_system_prompt_snapshot(conversation_id, &snapshot)
            .await?;
    }
    Ok(())
}
