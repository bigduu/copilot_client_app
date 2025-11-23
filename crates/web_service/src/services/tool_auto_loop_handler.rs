use std::sync::Arc;

use actix_web_lab::sse;
use context_manager::{ChatEvent, ContextUpdate, MessageUpdate};
use serde_json::json;
use tokio::sync::mpsc;
use tool_system::ToolExecutor;
use uuid::Uuid;

use crate::storage::StorageProvider;

use super::agent_service::{AgentService, ToolCall};
use super::approval_manager::ApprovalManager;
use super::llm_utils::{detect_message_type, send_context_update};
use super::session_manager::ChatSessionManager;

pub struct ToolAutoLoopHandler<T: StorageProvider> {
    session_manager: Arc<ChatSessionManager<T>>,
    agent_service: Arc<AgentService>,
    tool_executor: Arc<ToolExecutor>,
    tool_coordinator: crate::services::tool_coordinator::ToolCoordinator<T>,
    approval_manager: Arc<ApprovalManager>,
    conversation_id: Uuid,
    event_tx: mpsc::Sender<sse::Event>,
}

impl<T: StorageProvider + 'static> ToolAutoLoopHandler<T> {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        session_manager: Arc<ChatSessionManager<T>>,
        agent_service: Arc<AgentService>,
        tool_executor: Arc<ToolExecutor>,
        approval_manager: Arc<ApprovalManager>,
        conversation_id: Uuid,
        event_tx: mpsc::Sender<sse::Event>,
    ) -> Self {
        let tool_coordinator = crate::services::tool_coordinator::ToolCoordinator::new(
            tool_executor.clone(),
            approval_manager.clone(),
            session_manager.clone(),
        );
        Self {
            session_manager,
            agent_service,
            tool_executor,
            tool_coordinator,
            approval_manager,
            conversation_id,
            event_tx,
        }
    }

    pub async fn handle_full_text(
        &self,
        full_text: &str,
        assistant_message_id: Option<Uuid>,
        _last_sequence: u64,
    ) {
        if full_text.is_empty() {
            return;
        }

        if let Some(tool_call) = self
            .agent_service
            .parse_tool_call_from_response(full_text)
            .ok()
            .flatten()
        {
            if let Err(err) = self.agent_service.validate_tool_call(&tool_call) {
                self.emit_error(format!("Invalid tool call: {}", err)).await;
                return;
            }

            if let Err(err) = self.process_tool_call(tool_call).await {
                self.emit_error(err).await;
            }

            return;
        }

        self.update_message_metadata(full_text, assistant_message_id)
            .await;
    }

    async fn process_tool_call(&self, tool_call: ToolCall) -> Result<(), String> {
        let context = self
            .session_manager
            .load_context(self.conversation_id, None)
            .await
            .map_err(|err| format!("Failed to load context: {}", err))?
            .ok_or_else(|| "Context not found".to_string())?;

        let options = crate::services::tool_coordinator::ToolExecutionOptions {
            request_id: None,
            terminate: tool_call.terminate,
            display_preference: None,
        };

        let updates = self
            .tool_coordinator
            .execute_tool(
                &context,
                tool_call.tool.clone(),
                tool_call.parameters.clone(),
                options,
            )
            .await
            .map_err(|err| err.to_string())?;

        for update in updates {
            if send_context_update(&self.event_tx, &update).await.is_err() {
                return Err("Client disconnected".to_string());
            }

            self.emit_tool_events(&update).await;

            if let (Some(MessageUpdate::Completed { message_id, .. }), Some(sequence)) = (
                update.message_update.as_ref(),
                update
                    .metadata
                    .get("sequence")
                    .and_then(|value| value.as_u64()),
            ) {
                let _ = send_content_signal(
                    &self.event_tx,
                    "content_final",
                    self.conversation_id,
                    *message_id,
                    sequence,
                    true,
                )
                .await;
            }
        }

        Ok(())
    }

    async fn update_message_metadata(&self, full_text: &str, assistant_message_id: Option<Uuid>) {
        if let Ok(Some(context)) = self
            .session_manager
            .load_context(self.conversation_id, None)
            .await
        {
            let mut context_lock = context.write().await;

            if let Some(message_id) = assistant_message_id {
                if let Some(node) = context_lock.message_pool.get_mut(&message_id) {
                    node.message.message_type = detect_message_type(full_text);
                }
            }

            context_lock.handle_event(ChatEvent::LLMResponseProcessed {
                has_tool_calls: false,
            });

            if let Err(err) = self.session_manager.auto_save_if_dirty(&context).await {
                log::error!("Failed to save context after streaming: {}", err);
            } else {
                context_lock.clear_dirty();
            }
        }
    }

    async fn emit_tool_events(&self, update: &ContextUpdate) {
        if let Some(tool_event) = update
            .metadata
            .get("tool_event")
            .and_then(|value| value.as_str())
        {
            match tool_event {
                "approval_requested" => {
                    if let Some(request_id) = update
                        .metadata
                        .get("request_id")
                        .and_then(|value| value.as_str())
                    {
                        let tool_description = update
                            .metadata
                            .get("tool_description")
                            .cloned()
                            .unwrap_or(json!(null));
                        let parameters = update
                            .metadata
                            .get("parameters")
                            .cloned()
                            .unwrap_or(json!({}));
                        if let Ok(data) = sse::Data::new_json(json!({
                            "type": "approval_required",
                            "request_id": request_id,
                            "session_id": self.conversation_id,
                            "tool": update
                                .metadata
                                .get("tool_name")
                                .and_then(|value| value.as_str())
                                .unwrap_or(""),
                            "tool_description": tool_description,
                            "parameters": parameters,
                            "done": true
                        })) {
                            let _ = self
                                .event_tx
                                .send(sse::Event::Data(data.event("approval_required")))
                                .await;
                        }
                    }
                }
                "execution_completed" => {
                    if let Some(result) = update.metadata.get("result") {
                        if let Ok(data) = sse::Data::new_json(json!({
                            "type": "tool_result",
                            "tool": update
                                .metadata
                                .get("tool_name")
                                .and_then(|value| value.as_str())
                                .unwrap_or(""),
                            "result": result,
                            "done": false
                        })) {
                            let _ = self
                                .event_tx
                                .send(sse::Event::Data(data.event("tool_result")))
                                .await;
                        }
                    }
                }
                "execution_failed" => {
                    if let Some(error_msg) = update
                        .metadata
                        .get("error")
                        .and_then(|value| value.as_str())
                    {
                        if let Ok(data) =
                            sse::Data::new_json(json!({"error": error_msg, "done": false}))
                        {
                            let _ = self
                                .event_tx
                                .send(sse::Event::Data(data.event("error")))
                                .await;
                        }
                    }
                }
                _ => {}
            }
        }
    }

    async fn emit_error(&self, message: String) {
        if let Ok(data) = sse::Data::new_json(json!({"error": message, "done": false})) {
            let _ = self
                .event_tx
                .send(sse::Event::Data(data.event("error")))
                .await;
        }
    }
}

pub async fn send_content_signal(
    tx: &mpsc::Sender<sse::Event>,
    event: &str,
    context_id: Uuid,
    message_id: Uuid,
    sequence: u64,
    is_final: bool,
) -> Result<(), ()> {
    let payload = json!({
        "context_id": context_id,
        "message_id": message_id,
        "sequence": sequence,
        "is_final": is_final,
    });

    match sse::Data::new_json(payload) {
        Ok(data) => tx
            .send(sse::Event::Data(data.event(event)))
            .await
            .map_err(|_| ()),
        Err(err) => {
            log::error!("Failed to serialise {} event payload: {}", event, err);
            Err(())
        }
    }
}
