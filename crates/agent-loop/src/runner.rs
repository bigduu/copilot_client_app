use std::sync::Arc;

use chrono::Utc;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use agent_core::agent::events::TokenUsage;
use agent_core::tools::{
    execute_tool_call, handle_tool_result_with_agentic_support, parse_tool_args, ToolExecutor,
    ToolHandlingOutcome, ToolSchema,
};
use agent_core::{AgentError, AgentEvent, Message, Session};
use agent_llm::LLMProvider;
use agent_metrics::{
    MetricsCollector, RoundStatus as MetricsRoundStatus, SessionStatus as MetricsSessionStatus,
    TokenUsage as MetricsTokenUsage,
};
use agent_tools::guide::{context::GuideBuildContext, EnhancedPromptBuilder};

use crate::config::AgentLoopConfig;
use crate::stream::handler::consume_llm_stream;

pub type Result<T> = std::result::Result<T, AgentError>;

pub async fn run_agent_loop_with_config(
    session: &mut Session,
    initial_message: String,
    event_tx: mpsc::Sender<AgentEvent>,
    llm: Arc<dyn LLMProvider>,
    tools: Arc<dyn ToolExecutor>,
    cancel_token: CancellationToken,
    config: AgentLoopConfig,
) -> Result<()> {
    let debug_logger = DebugLogger::new(log::log_enabled!(log::Level::Debug));
    let session_id = session.id.clone();
    let metrics_collector = config.metrics_collector.clone();
    let model_name = config
        .model_name
        .clone()
        .unwrap_or_else(|| "unknown".to_string());

    if let Some(metrics) = metrics_collector.as_ref() {
        metrics.session_started(session_id.clone(), model_name.clone(), session.created_at);
        metrics.session_message_count(
            session_id.clone(),
            session.messages.len() as u32,
            Utc::now(),
        );
    }

    log::debug!(
        "[{}] Starting agent loop with message: {}",
        session_id,
        initial_message
    );
    debug_logger.log_event(
        &session_id,
        "agent_loop_start",
        serde_json::json!({
            "message": initial_message,
            "max_rounds": config.max_rounds,
            "initial_message_count": session.messages.len(),
        }),
    );

    let skill_context = if let Some(skill_manager) = config.skill_manager.as_ref() {
        let context = skill_manager
            .build_skill_context(Some(session.id.as_str()))
            .await;
        if !context.is_empty() {
            log::info!(
                "[{}] Skill context loaded, length: {} chars",
                session_id,
                context.len()
            );
            log::debug!("[{}] Skill context content:\n{}", session_id, context);
        } else {
            log::info!("[{}] No skill context loaded (empty)", session_id);
        }
        context
    } else {
        log::info!("[{}] No skill manager configured", session_id);
        String::new()
    };

    // Build tool guide context for enhanced prompting
    let base_prompt_for_language = config
        .system_prompt
        .as_deref()
        .or_else(|| {
            session
                .messages
                .iter()
                .find(|message| matches!(message.role, agent_core::Role::System))
                .map(|message| message.content.as_str())
        })
        .unwrap_or_default();
    let guide_context = GuideBuildContext::from_system_prompt(base_prompt_for_language);
    let tool_schemas = resolve_available_tool_schemas(&config, tools.as_ref());
    let tool_guide_context = EnhancedPromptBuilder::build(
        Some(config.tool_registry.as_ref()),
        &tool_schemas,
        &guide_context,
    );
    log::info!(
        "[{}] Tool guide context built, length: {} chars",
        session_id,
        tool_guide_context.len()
    );

    if let Some(system_message) = session
        .messages
        .iter_mut()
        .find(|message| matches!(message.role, agent_core::Role::System))
    {
        let base_prompt = config
            .system_prompt
            .as_deref()
            .unwrap_or(&system_message.content);
        system_message.content =
            merge_system_prompt_with_contexts(base_prompt, &skill_context, &tool_guide_context);
    } else {
        let base_prompt = config.system_prompt.as_deref().unwrap_or_default();
        let merged_prompt =
            merge_system_prompt_with_contexts(base_prompt, &skill_context, &tool_guide_context);
        if !merged_prompt.is_empty() {
            session.messages.insert(0, Message::system(merged_prompt));
        }
    }

    if !config.skip_initial_user_message {
        session.add_message(Message::user(initial_message.clone()));
        if let Some(metrics) = metrics_collector.as_ref() {
            metrics.session_message_count(
                session_id.clone(),
                session.messages.len() as u32,
                Utc::now(),
            );
        }
    }

    let mut sent_complete = false;

    for round in 0..config.max_rounds {
        // Inject todo list into system message at the start of each round
        inject_todo_list_into_system_message(session);

        let round_id = format!("{}-round-{}", session_id, round + 1);
        let mut round_status = MetricsRoundStatus::Success;
        let mut round_error: Option<String> = None;

        debug_logger.log_event(
            &session_id,
            "round_start",
            serde_json::json!({
                "round": round + 1,
                "total_rounds": config.max_rounds,
                "message_count": session.messages.len(),
            }),
        );

        if cancel_token.is_cancelled() {
            if let Some(metrics) = metrics_collector.as_ref() {
                metrics.session_message_count(
                    session_id.clone(),
                    session.messages.len() as u32,
                    Utc::now(),
                );
                metrics.session_completed(
                    session_id.clone(),
                    MetricsSessionStatus::Cancelled,
                    Utc::now(),
                );
            }
            return Err(AgentError::Cancelled);
        }

        if let Some(metrics) = metrics_collector.as_ref() {
            metrics.round_started(
                round_id.clone(),
                session_id.clone(),
                model_name.clone(),
                Utc::now(),
            );
        }

        let tool_schemas = resolve_available_tool_schemas(&config, tools.as_ref());

        let timer = Timer::new("llm_request");
        let stream = match llm.chat_stream(&session.messages, &tool_schemas).await {
            Ok(stream) => stream,
            Err(error) => {
                let agent_error = AgentError::LLM(error.to_string());
                round_status = MetricsRoundStatus::Error;
                round_error = Some(agent_error.to_string());
                if let Some(metrics) = metrics_collector.as_ref() {
                    metrics.round_completed(
                        round_id.clone(),
                        Utc::now(),
                        round_status,
                        MetricsTokenUsage::default(),
                        round_error.clone(),
                    );
                    metrics.session_message_count(
                        session_id.clone(),
                        session.messages.len() as u32,
                        Utc::now(),
                    );
                    metrics.session_completed(
                        session_id.clone(),
                        MetricsSessionStatus::Error,
                        Utc::now(),
                    );
                }
                return Err(agent_error);
            }
        };

        let stream_output =
            match consume_llm_stream(stream, &event_tx, &cancel_token, &session_id).await {
                Ok(output) => output,
                Err(error) => {
                    round_status = if matches!(error, AgentError::Cancelled) {
                        MetricsRoundStatus::Cancelled
                    } else {
                        MetricsRoundStatus::Error
                    };
                    round_error = Some(error.to_string());
                    if let Some(metrics) = metrics_collector.as_ref() {
                        metrics.round_completed(
                            round_id.clone(),
                            Utc::now(),
                            round_status,
                            MetricsTokenUsage::default(),
                            round_error.clone(),
                        );
                        let session_status = if matches!(error, AgentError::Cancelled) {
                            MetricsSessionStatus::Cancelled
                        } else {
                            MetricsSessionStatus::Error
                        };
                        metrics.session_message_count(
                            session_id.clone(),
                            session.messages.len() as u32,
                            Utc::now(),
                        );
                        metrics.session_completed(session_id.clone(), session_status, Utc::now());
                    }
                    return Err(error);
                }
            };

        let round_usage = MetricsTokenUsage {
            prompt_tokens: 0,
            completion_tokens: stream_output.token_count as u64,
            total_tokens: stream_output.token_count as u64,
        };

        let llm_duration = timer.elapsed_ms();
        timer.debug(&session_id);
        log::debug!(
            "[{}] LLM response completed in {}ms, {} tokens received",
            session_id,
            llm_duration,
            stream_output.token_count
        );

        if stream_output.tool_calls.is_empty() {
            session.add_message(Message::assistant(stream_output.content, None));

            let _ = event_tx
                .send(AgentEvent::Complete {
                    usage: TokenUsage {
                        prompt_tokens: 0,
                        completion_tokens: stream_output.token_count as u32,
                        total_tokens: stream_output.token_count as u32,
                    },
                })
                .await;

            if let Some(metrics) = metrics_collector.as_ref() {
                metrics.round_completed(
                    round_id.clone(),
                    Utc::now(),
                    MetricsRoundStatus::Success,
                    round_usage,
                    None,
                );
                metrics.session_message_count(
                    session_id.clone(),
                    session.messages.len() as u32,
                    Utc::now(),
                );
            }

            sent_complete = true;
            break;
        }

        session.add_message(Message::assistant(
            stream_output.content,
            Some(stream_output.tool_calls.clone()),
        ));

        let mut awaiting_clarification = false;

        for tool_call in &stream_output.tool_calls {
            let args = parse_tool_args(&tool_call.function.arguments)
                .unwrap_or_else(|_| serde_json::json!({}));

            send_event_with_metrics(
                &event_tx,
                metrics_collector.as_ref(),
                &session_id,
                &round_id,
                AgentEvent::ToolStart {
                    tool_call_id: tool_call.id.clone(),
                    tool_name: tool_call.function.name.clone(),
                    arguments: args,
                },
            )
            .await;

            let tool_timer = Timer::new(format!("tool_{}", tool_call.function.name));

            match execute_tool_call(
                tool_call,
                tools.as_ref(),
                config.composition_executor.as_ref().map(Arc::clone),
            )
            .await
            {
                Ok(result) => {
                    // Handle todo list tools specially
                    if tool_call.function.name == "create_todo_list" && result.success {
                        if let Ok(args) =
                            serde_json::from_str::<serde_json::Value>(&tool_call.function.arguments)
                        {
                            if let (Some(title), Some(items)) =
                                (args["title"].as_str(), args["items"].as_array())
                            {
                                let todo_items: Vec<agent_core::TodoItem> = items
                                    .iter()
                                    .filter_map(|item| {
                                        let id = item["id"].as_str()?.to_string();
                                        let description = item["description"].as_str()?.to_string();
                                        let depends_on: Vec<String> = item["depends_on"]
                                            .as_array()
                                            .map(|arr| {
                                                arr.iter()
                                                    .filter_map(|v| v.as_str().map(String::from))
                                                    .collect()
                                            })
                                            .unwrap_or_default();
                                        Some(agent_core::TodoItem {
                                            id,
                                            description,
                                            status: agent_core::TodoItemStatus::Pending,
                                            depends_on,
                                            notes: String::new(),
                                        })
                                    })
                                    .collect();

                                let todo_list = agent_core::TodoList {
                                    session_id: session_id.clone(),
                                    title: title.to_string(),
                                    items: todo_items.clone(),
                                    created_at: chrono::Utc::now(),
                                    updated_at: chrono::Utc::now(),
                                };
                                session.set_todo_list(todo_list.clone());
                                log::info!(
                                    "[{}] Todo list '{}' created with {} items",
                                    session_id,
                                    title,
                                    items.len()
                                );

                                // Save session to persist todo list
                                if let Some(ref storage) = config.storage {
                                    if let Err(e) = storage.save_session(session).await {
                                        log::warn!("[{}] Failed to save session after todo list creation: {}", session_id, e);
                                    } else {
                                        log::debug!(
                                            "[{}] Session saved after todo list creation",
                                            session_id
                                        );
                                    }
                                }

                                // Emit event for frontend
                                let _ = event_tx
                                    .send(AgentEvent::TodoListUpdated { todo_list })
                                    .await;
                            }
                        }
                    } else if tool_call.function.name == "update_todo_item" && result.success {
                        if let Ok(args) =
                            serde_json::from_str::<serde_json::Value>(&tool_call.function.arguments)
                        {
                            if let (Some(item_id), Some(status)) =
                                (args["item_id"].as_str(), args["status"].as_str())
                            {
                                let status_enum = match status {
                                    "pending" => Some(agent_core::TodoItemStatus::Pending),
                                    "in_progress" => Some(agent_core::TodoItemStatus::InProgress),
                                    "completed" => Some(agent_core::TodoItemStatus::Completed),
                                    "blocked" => Some(agent_core::TodoItemStatus::Blocked),
                                    _ => None,
                                };
                                if let Some(s) = status_enum {
                                    let notes = args["notes"].as_str();
                                    if let Err(e) = session.update_todo_item(item_id, s, notes) {
                                        log::warn!(
                                            "[{}] Failed to update todo item: {}",
                                            session_id,
                                            e
                                        );
                                    } else {
                                        log::info!(
                                            "[{}] Updated todo item '{}' to '{}'",
                                            session_id,
                                            item_id,
                                            status
                                        );

                                        // Save session to persist todo list changes
                                        if let Some(ref storage) = config.storage {
                                            if let Err(e) = storage.save_session(session).await {
                                                log::warn!("[{}] Failed to save session after todo item update: {}", session_id, e);
                                            } else {
                                                log::debug!(
                                                    "[{}] Session saved after todo item update",
                                                    session_id
                                                );
                                            }
                                        }

                                        // Emit event for frontend
                                        if let Some(ref todo_list) = session.todo_list {
                                            let _ = event_tx
                                                .send(AgentEvent::TodoListUpdated {
                                                    todo_list: todo_list.clone(),
                                                })
                                                .await;
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Handle ask_user tool specially - emit NeedClarification event
                    if tool_call.function.name == "ask_user" && result.success {
                        if let Ok(payload) =
                            serde_json::from_str::<serde_json::Value>(&result.result)
                        {
                            let question = payload["question"]
                                .as_str()
                                .unwrap_or("Please select:")
                                .to_string();
                            let options: Vec<String> = payload["options"]
                                .as_array()
                                .map(|arr| {
                                    arr.iter()
                                        .filter_map(|v| v.as_str().map(String::from))
                                        .collect()
                                })
                                .unwrap_or_default();
                            let allow_custom = payload["allow_custom"].as_bool().unwrap_or(true);

                            log::info!(
                                "[{}] ask_user tool called, awaiting user response",
                                session_id
                            );

                            // Add tool result message (required by OpenAI API)
                            // This is a placeholder indicating we're waiting for user
                            let tool_result_msg = Message::tool_result(
                                tool_call.id.clone(),
                                format!("Waiting for user response to: {}", question),
                            );
                            log::debug!("[{}] Adding tool result message for ask_user, tool_call_id: {}, message_id: {}",
                                session_id, tool_call.id, tool_result_msg.id);
                            session.add_message(tool_result_msg);

                            // Emit NeedClarification event with options
                            let _ = event_tx
                                .send(AgentEvent::NeedClarification {
                                    question: question.clone(),
                                    options: if options.is_empty() {
                                        None
                                    } else {
                                        Some(options.clone())
                                    },
                                })
                                .await;

                            // Store pending question in session for resume handling
                            session.set_pending_question(
                                tool_call.id.clone(),
                                question,
                                options,
                                allow_custom,
                            );

                            // Save session to persist the pending question
                            if let Some(ref storage) = config.storage {
                                if let Err(e) = storage.save_session(session).await {
                                    log::warn!(
                                        "[{}] Failed to save session after ask_user: {}",
                                        session_id,
                                        e
                                    );
                                }
                            }

                            awaiting_clarification = true;
                            break;
                        }
                    }

                    send_event_with_metrics(
                        &event_tx,
                        metrics_collector.as_ref(),
                        &session_id,
                        &round_id,
                        AgentEvent::ToolComplete {
                            tool_call_id: tool_call.id.clone(),
                            result: result.clone(),
                        },
                    )
                    .await;

                    if !result.success && round_error.is_none() {
                        round_status = MetricsRoundStatus::Error;
                        round_error = Some(format!(
                            "Tool \"{}\" returned an unsuccessful result",
                            tool_call.function.name
                        ));
                    }

                    debug_logger.log_event(
                        &session_id,
                        "tool_complete",
                        serde_json::json!({
                            "tool_name": tool_call.function.name,
                            "tool_call_id": tool_call.id,
                            "duration_ms": tool_timer.elapsed_ms(),
                            "success": result.success,
                        }),
                    );

                    let outcome = handle_tool_result_with_agentic_support(
                        &result,
                        tool_call,
                        &event_tx,
                        session,
                        tools.as_ref(),
                        config.composition_executor.as_ref().map(Arc::clone),
                    )
                    .await;

                    if outcome == ToolHandlingOutcome::AwaitingClarification {
                        awaiting_clarification = true;
                        break;
                    }
                }
                Err(error) => {
                    let error_message = error.to_string();
                    round_status = MetricsRoundStatus::Error;
                    round_error = Some(error_message.clone());

                    send_event_with_metrics(
                        &event_tx,
                        metrics_collector.as_ref(),
                        &session_id,
                        &round_id,
                        AgentEvent::ToolError {
                            tool_call_id: tool_call.id.clone(),
                            error: error_message.clone(),
                        },
                    )
                    .await;

                    session.add_message(Message::tool_result(
                        tool_call.id.clone(),
                        format!("Error: {error_message}"),
                    ));
                }
            }
        }

        if awaiting_clarification {
            if let Some(metrics) = metrics_collector.as_ref() {
                metrics.round_completed(
                    round_id.clone(),
                    Utc::now(),
                    round_status,
                    round_usage,
                    round_error.clone(),
                );
                metrics.session_message_count(
                    session_id.clone(),
                    session.messages.len() as u32,
                    Utc::now(),
                );
            }
            break;
        }

        debug_logger.log_event(
            &session_id,
            "round_complete",
            serde_json::json!({
                "round": round + 1,
                "message_count": session.messages.len(),
            }),
        );

        if let Some(metrics) = metrics_collector.as_ref() {
            metrics.round_completed(
                round_id.clone(),
                Utc::now(),
                round_status,
                round_usage,
                round_error.clone(),
            );
            metrics.session_message_count(
                session_id.clone(),
                session.messages.len() as u32,
                Utc::now(),
            );
        }
    }

    if !sent_complete {
        let _ = event_tx
            .send(AgentEvent::Complete {
                usage: TokenUsage {
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    total_tokens: 0,
                },
            })
            .await;
    }

    if let Some(metrics) = metrics_collector.as_ref() {
        metrics.session_message_count(
            session_id.clone(),
            session.messages.len() as u32,
            Utc::now(),
        );
        if !session.has_pending_question() {
            metrics.session_completed(session_id, MetricsSessionStatus::Completed, Utc::now());
        }
    }

    Ok(())
}

async fn send_event_with_metrics(
    event_tx: &mpsc::Sender<AgentEvent>,
    metrics_collector: Option<&MetricsCollector>,
    session_id: &str,
    round_id: &str,
    event: AgentEvent,
) {
    if let Some(metrics) = metrics_collector {
        metrics.record_agent_event(session_id, round_id, &event);
    }

    let _ = event_tx.send(event).await;
}

fn resolve_available_tool_schemas(
    config: &AgentLoopConfig,
    tools: &dyn ToolExecutor,
) -> Vec<ToolSchema> {
    let mut tool_schemas = config.tool_registry.list_tools();
    if tool_schemas.is_empty() {
        tool_schemas = tools.list_tools();
    }

    tool_schemas.extend(config.additional_tool_schemas.clone());
    tool_schemas.sort_by(|left, right| left.function.name.cmp(&right.function.name));
    tool_schemas.dedup_by(|left, right| left.function.name == right.function.name);
    tool_schemas
}

const SKILL_CONTEXT_MARKER: &str = "\n\n## Available Skills\n";
const TOOL_GUIDE_MARKER: &str = "## Tool Usage Guidelines\n";

fn merge_system_prompt_with_contexts(
    base_prompt: &str,
    skill_context: &str,
    tool_guide_context: &str,
) -> String {
    let mut merged = strip_existing_tool_guide_context(&strip_existing_skill_context(base_prompt));

    let sections: Vec<&str> = [skill_context, tool_guide_context]
        .into_iter()
        .map(str::trim)
        .filter(|section| !section.is_empty())
        .collect();

    if sections.is_empty() {
        return merged;
    }

    if merged.trim().is_empty() {
        return sections.join("\n\n");
    }

    for section in sections {
        merged.push_str("\n\n");
        merged.push_str(section);
    }

    merged
}

fn strip_existing_skill_context(prompt: &str) -> String {
    strip_existing_prompt_section(prompt, SKILL_CONTEXT_MARKER)
}

fn strip_existing_tool_guide_context(prompt: &str) -> String {
    strip_existing_prompt_section(prompt, TOOL_GUIDE_MARKER)
}

fn strip_existing_prompt_section(prompt: &str, marker: &str) -> String {
    if let Some(index) = prompt.find(marker) {
        prompt[..index].trim_end().to_string()
    } else {
        prompt.to_string()
    }
}

const TODO_LIST_MARKER: &str = "\n\n## Current Task List:";

/// Inject todo list into system message if it exists
fn inject_todo_list_into_system_message(session: &mut Session) {
    let todo_context = session.format_todo_list_for_prompt();

    if let Some(system_message) = session
        .messages
        .iter_mut()
        .find(|message| matches!(message.role, agent_core::Role::System))
    {
        let base_prompt = strip_existing_todo_list(&system_message.content);

        if !todo_context.is_empty() {
            system_message.content = format!("{}\n{}", base_prompt, todo_context);
            log::info!(
                "Injected todo list into system message ({} chars)",
                todo_context.len()
            );
        } else {
            system_message.content = base_prompt;
        }
    } else if !todo_context.is_empty() {
        // No system message exists but we have todo context
        session
            .messages
            .insert(0, Message::system(todo_context.clone()));
        log::info!(
            "Created system message with todo list ({} chars)",
            todo_context.len()
        );
    }
}

fn strip_existing_todo_list(prompt: &str) -> String {
    if let Some(index) = prompt.find(TODO_LIST_MARKER) {
        prompt[..index].trim_end().to_string()
    } else {
        prompt.to_string()
    }
}

#[allow(dead_code)]
pub async fn run_agent_loop(
    session: &mut Session,
    initial_message: String,
    event_tx: mpsc::Sender<AgentEvent>,
    llm: Arc<dyn LLMProvider>,
    tools: Arc<dyn ToolExecutor>,
    cancel_token: CancellationToken,
    max_rounds: usize,
) -> Result<()> {
    run_agent_loop_with_config(
        session,
        initial_message,
        event_tx,
        llm,
        tools,
        cancel_token,
        AgentLoopConfig {
            max_rounds,
            skip_initial_user_message: false,
            ..Default::default()
        },
    )
    .await
}

struct DebugLogger {
    enabled: bool,
}

impl DebugLogger {
    fn new(enabled: bool) -> Self {
        Self { enabled }
    }

    fn log_event(&self, session_id: &str, event_type: &str, details: serde_json::Value) {
        if !self.enabled {
            return;
        }

        log::debug!("[{}] {}: {}", session_id, event_type, details);
    }
}

struct Timer {
    name: String,
    start: std::time::Instant,
}

impl Timer {
    fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            start: std::time::Instant::now(),
        }
    }

    fn elapsed_ms(&self) -> u128 {
        self.start.elapsed().as_millis()
    }

    fn debug(&self, session_id: &str) {
        log::debug!(
            "[{}] {} completed in {}ms",
            session_id,
            self.name,
            self.elapsed_ms()
        );
    }
}

#[cfg(test)]
mod tests {
    use super::{
        merge_system_prompt_with_contexts, strip_existing_skill_context,
        strip_existing_tool_guide_context,
    };

    #[test]
    fn merge_system_prompt_with_contexts_appends_both_contexts() {
        let merged = merge_system_prompt_with_contexts(
            "You are a helpful assistant.",
            "\n\n## Available Skills\n\n### Skill\nDetails",
            "## Tool Usage Guidelines\n\n### File Reading Tools\nDetails",
        );
        assert!(merged.starts_with("You are a helpful assistant."));
        assert!(merged.contains("## Available Skills"));
        assert!(merged.contains("## Tool Usage Guidelines"));
    }

    #[test]
    fn merge_system_prompt_with_contexts_handles_empty_base_prompt() {
        let merged = merge_system_prompt_with_contexts(
            "",
            "\n\n## Available Skills\n\n### Skill",
            "## Tool Usage Guidelines\n\n### File Reading Tools",
        );
        assert_eq!(
            merged,
            "## Available Skills\n\n### Skill\n\n## Tool Usage Guidelines\n\n### File Reading Tools"
        );
    }

    #[test]
    fn strip_existing_skill_context_removes_previous_section() {
        let stripped = strip_existing_skill_context(
            "Base prompt\n\n## Available Skills\n\n### One\nInstructions",
        );
        assert_eq!(stripped, "Base prompt");
    }

    #[test]
    fn strip_existing_tool_guide_context_removes_previous_section() {
        let stripped = strip_existing_tool_guide_context(
            "Base prompt\n\n## Tool Usage Guidelines\n\n### File Reading Tools\nInstructions",
        );
        assert_eq!(stripped, "Base prompt");
    }
}
