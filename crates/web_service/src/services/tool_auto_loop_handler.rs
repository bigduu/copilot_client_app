use std::sync::Arc;

use actix_web_lab::sse;
use context_manager::structs::message_types::{RichMessageType, TodoListMsg};
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
        Self {
            session_manager,
            agent_service,
            tool_executor,
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

        // 1. Check for tool calls (existing logic)
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

        // 2. Check for agent continuation (NEW)
        if let Some(reason) = self.parse_agent_continue(full_text) {
            tracing::info!("Agent continuation requested: {}", reason);
            if let Err(err) = self.continue_agent_loop(reason).await {
                self.emit_error(format!("Continuation failed: {}", err))
                    .await;
            }
            return;
        }

        // 3. Regular completion - update metadata
        self.update_message_metadata(full_text, assistant_message_id)
            .await;
    }

    async fn process_tool_call(&self, tool_call: ToolCall) -> Result<(), String> {
        let context = Arc::new(
            self.session_manager
                .load_context(self.conversation_id, None)
                .await
                .map_err(|err| format!("Failed to load context: {}", err))?
                .ok_or_else(|| "Context not found".to_string())?,
        );

        // Inline tool execution (was ToolCoordinator)
        {
            let mut ctx = context.write().await;
            let depth = ctx.tool_execution.auto_loop_depth() + 1;
            ctx.begin_auto_loop(depth);
            ctx.begin_tool_execution(&tool_call.tool, 1, None);
        }

        let result = self
            .tool_executor
            .execute_tool(
                &tool_call.tool,
                tool_system::types::ToolArguments::Json(tool_call.parameters.clone()),
            )
            .await;

        let updates = match result {
            Ok(value) => {
                let mut updates = Vec::new();
                {
                    let mut ctx = context.write().await;
                    updates.push(ctx.record_auto_loop_progress());
                    
                    let mut completion = ctx.complete_tool_execution();
                    completion.metadata.insert("result".to_string(), value.clone());
                    completion.metadata.insert("tool_name".to_string(), json!(tool_call.tool.clone()));
                    updates.push(completion);
                    
                    updates.push(ctx.complete_auto_loop());
                }
                self.session_manager.auto_save_if_dirty(&context).await
                    .map_err(|e| format!("Auto-save failed: {}", e))?;
                updates
            }
            Err(e) => {
                let mut updates = Vec::new();
                {
                    let mut ctx = context.write().await;
                    updates.push(ctx.record_tool_execution_failure(
                        &tool_call.tool,
                        0,
                        &e.to_string(),
                        None,
                    ));
                }
                self.session_manager.auto_save_if_dirty(&context).await
                    .map_err(|err| format!("Auto-save failed: {}", err))?;
                return Err(format!("Tool execution failed: {}", e));
            }
        };

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

                    // Detect and parse Todo List from Markdown
                    // This allows the frontend to render the TodoListDisplay component
                    if let Some((title, items)) = self.parse_todo_list_from_text(full_text) {
                        tracing::info!(
                            "Detected Todo List in message {}: {} items",
                            message_id,
                            items.len()
                        );
                        // Create structured TodoListMsg
                        let todo_list_msg = TodoListMsg::new(
                            title, items, None, // Optional description
                            message_id,
                        );
                        // Attach to message as RichType
                        node.message.rich_type = Some(RichMessageType::TodoList(todo_list_msg));
                    }
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

    /// Parse markdown Todo list from text
    /// Returns (Title, Vec<Description>)
    fn parse_todo_list_from_text(&self, text: &str) -> Option<(String, Vec<String>)> {
        // Must contain at least one todo item marker
        if !text.contains("- [ ]") && !text.contains("- [x]") && !text.contains("- [/]") {
            return None;
        }

        let mut title = "Todo List".to_string();
        let mut items = Vec::new();

        // Regex for capturing items: "- [status] description"
        // Matches "- [ ]", "- [x]", "- [/]"
        let item_re = regex::Regex::new(r"^\s*-\s*\[([ x/])\]\s+(.+)").ok()?;

        // Regex for detecting Title (Header 1 or 2)
        // Matches "# Title" or "## Title"
        let title_re = regex::Regex::new(r"^\s*#{1,2}\s+(.+)").ok()?;

        let mut found_items = false;

        for line in text.lines() {
            let trimmed = line.trim();

            // Capture Title (only use the first one found before items)
            if !found_items {
                if let Some(cap) = title_re.captures(trimmed) {
                    if let Some(m) = cap.get(1) {
                        title = m.as_str().trim().to_string();
                    }
                }
            }

            // Capture Items
            if let Some(cap) = item_re.captures(trimmed) {
                if let Some(desc) = cap.get(2) {
                    items.push(desc.as_str().trim().to_string());
                    found_items = true;
                }
            }
        }

        if items.is_empty() {
            return None;
        }

        Some((title, items))
    }

    /// Parse agent continuation marker from response
    /// Format: <!-- AGENT_CONTINUE: reason -->
    fn parse_agent_continue(&self, text: &str) -> Option<String> {
        // Match <!-- AGENT_CONTINUE: reason -->
        let re = regex::Regex::new(r"<!--\s*AGENT_CONTINUE:\s*(.+?)\s*-->").ok()?;
        re.captures(text)
            .and_then(|cap| cap.get(1))
            .map(|m| m.as_str().trim().to_string())
    }

    /// Continue agent loop - Frontend-driven with persistent tracking
    ///
    /// Tracks continuation in context for reliability across sessions.
    async fn continue_agent_loop(&self, reason: String) -> Result<(), String> {
        tracing::info!("Agent continuation requested: {}", reason);

        const MAX_CONTINUATIONS: u32 = 10;

        // Load context and check/update continuation counter
        if let Ok(Some(context)) = self
            .session_manager
            .load_context(self.conversation_id, None)
            .await
        {
            let mut context_lock = context.write().await;

            // Check limit
            if context_lock.continuation_count >= MAX_CONTINUATIONS {
                tracing::warn!(
                    "Maximum continuation limit ({}) reached for context {}",
                    MAX_CONTINUATIONS,
                    self.conversation_id
                );

                // Emit warning event
                if let Ok(data) = sse::Data::new_json(json!({
                    "type": "continuation_limit_reached",
                    "count": context_lock.continuation_count,
                    "reasons": context_lock.continuation_reasons,
                })) {
                    let _ = self
                        .event_tx
                        .send(sse::Event::Data(data.event("warning")))
                        .await;
                }

                return Err(format!(
                    "Maximum continuation limit ({}) reached",
                    MAX_CONTINUATIONS
                ));
            }

            // Increment counter and record reason
            context_lock.continuation_count += 1;
            context_lock.continuation_reasons.push(reason.clone());
            let current_count = context_lock.continuation_count;

            tracing::info!(
                "Continuation count: {}/{} for context {}",
                current_count,
                MAX_CONTINUATIONS,
                self.conversation_id
            );

            // Find last message and add metadata
            let last_message_id = context_lock
                .branches
                .get(&context_lock.active_branch_name)
                .and_then(|branch| branch.message_ids.last())
                .copied();

            if let Some(message_id) = last_message_id {
                if let Some(node) = context_lock.message_pool.get_mut(&message_id) {
                    use serde_json::json;
                    use std::collections::HashMap;

                    // Add or update message metadata
                    if node.message.metadata.is_none() {
                        node.message.metadata = Some(context_manager::MessageMetadata::default());
                    }

                    if let Some(ref mut metadata) = node.message.metadata {
                        if metadata.extra.is_none() {
                            metadata.extra = Some(HashMap::new());
                        }

                        if let Some(ref mut extra) = metadata.extra {
                            extra.insert("should_continue".to_string(), json!(true));
                            extra.insert("continue_reason".to_string(), json!(reason.clone()));
                            extra.insert("continuation_count".to_string(), json!(current_count));
                        }
                    }

                    tracing::info!(
                        "Added continuation metadata to message {}: {} (count: {})",
                        message_id,
                        reason,
                        current_count
                    );
                }
            }

            // Save context with updated counter
            if let Err(err) = self.session_manager.auto_save_if_dirty(&context).await {
                tracing::error!("Failed to save context after continuation: {}", err);
            } else {
                context_lock.clear_dirty();
            }
        }

        // Emit SSE event
        if let Ok(data) = sse::Data::new_json(json!({
            "type": "agent_continue",
            "reason": reason.clone(),
            "session_id": self.conversation_id,
        })) {
            let _ = self
                .event_tx
                .send(sse::Event::Data(data.event("agent_continue")))
                .await;
        }

        Ok(())
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
