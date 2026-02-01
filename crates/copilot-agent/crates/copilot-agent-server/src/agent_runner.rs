use std::sync::Arc;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use futures::StreamExt;

use copilot_agent_core::{Session, Message, AgentEvent, AgentError};
use copilot_agent_core::agent::events::TokenUsage;
use copilot_agent_core::tools::{ToolExecutor, ToolCall};
use copilot_agent_llm::{LLMProvider, LLMChunk};
use crate::logging::{DebugLogger, Timer};
use uuid::Uuid;

pub type Result<T> = std::result::Result<T, AgentError>;

/// Configuration for agent loop
pub struct AgentLoopConfig {
    pub max_rounds: usize,
    pub system_prompt: Option<String>,
    pub additional_tool_schemas: Vec<copilot_agent_core::tools::ToolSchema>,
}

impl Default for AgentLoopConfig {
    fn default() -> Self {
        Self {
            max_rounds: 50,
            system_prompt: None,
            additional_tool_schemas: Vec::new(),
        }
    }
}

/// Run agent loop with optional system prompt and additional tools
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
    
    log::debug!("[{}] Starting agent loop with message: {}", session_id, initial_message);
    debug_logger.log_event(&session_id, "agent_loop_start", serde_json::json!({
        "message": initial_message,
        "max_rounds": config.max_rounds,
        "initial_message_count": session.messages.len(),
    }));

    // Add system message if provided
    if let Some(ref system_prompt) = config.system_prompt {
        if !session.messages.iter().any(|m| matches!(m.role, copilot_agent_core::Role::System)) {
            session.messages.insert(0, Message::system(system_prompt.clone()));
            log::debug!("[{}] Added system prompt", session_id);
        }
    }

    // 1. 添加用户消息
    session.add_message(Message::user(initial_message.clone()));
    log::debug!("[{}] Added user message, total messages: {}", session_id, session.messages.len());

    // 2. 循环最多 max_rounds 轮
    let mut sent_complete = false;

    for round in 0..config.max_rounds {
        log::debug!("[{}] Starting round {}/{}", session_id, round + 1, config.max_rounds);
        debug_logger.log_event(&session_id, "round_start", serde_json::json!({
            "round": round + 1,
            "total_rounds": config.max_rounds,
            "message_count": session.messages.len(),
        }));

        // 检查取消
        if cancel_token.is_cancelled() {
            log::debug!("[{}] Agent loop cancelled", session_id);
            return Err(AgentError::Cancelled);
        }

        // 获取工具列表（基础工具 + skill 关联工具）
        let mut tool_schemas = tools.list_tools();
        tool_schemas.extend(config.additional_tool_schemas.clone());
        log::debug!("[{}] Available tools: {} (base: {}, from skills: {})", 
            session_id, 
            tool_schemas.len(),
            tools.list_tools().len(),
            config.additional_tool_schemas.len()
        );

        // 调用 LLM (流式)
        let timer = Timer::new("llm_request");
        let mut stream = match llm
            .chat_stream(&session.messages, &tool_schemas)
            .await
        {
            Ok(s) => {
                log::debug!("[{}] LLM stream created successfully", session_id);
                s
            }
            Err(e) => {
                log::error!("[{}] Failed to create LLM stream: {}", session_id, e);
                return Err(AgentError::LLM(e.to_string()));
            }
        };

        let mut accumulated_content = String::new();
        let mut current_tool_call_parts: Vec<PartialToolCall> = Vec::new();
        let mut token_count = 0;

        // 处理流式响应
        while let Some(chunk_result) = stream.next().await {
            // 检查取消
            if cancel_token.is_cancelled() {
                log::debug!("[{}] Stream cancelled", session_id);
                return Err(AgentError::Cancelled);
            }

            match chunk_result {
                Ok(LLMChunk::Token(content)) => {
                    accumulated_content.push_str(&content);
                    token_count += content.len();
                    
                    // 每 10 个 token 输出一次 debug 信息
                    if token_count % 10 == 0 {
                        log::debug!("[{}] Received {} tokens so far", session_id, token_count);
                    }
                    
                    // 发送 token 事件到前端
                    let _ = event_tx.send(AgentEvent::Token {
                        content: content.clone(),
                    }).await;
                }
                Ok(LLMChunk::ToolCalls(partial_calls)) => {
                    log::debug!("[{}] Received {} tool call parts", session_id, partial_calls.len());
                    debug_logger.log_event(&session_id, "tool_calls_detected", serde_json::json!({
                        "count": partial_calls.len(),
                        "tools": partial_calls.iter().map(|c| &c.function.name).collect::<Vec<_>>(),
                    }));
                    
                    // 累积工具调用部分
                    for call in partial_calls {
                        update_partial_tool_call(&mut current_tool_call_parts, call);
                    }
                }
                Ok(LLMChunk::Done) => {
                    log::debug!("[{}] Stream completed", session_id);
                }
                Err(e) => {
                    log::error!("[{}] Stream error: {}", session_id, e);
                    let _ = event_tx.send(AgentEvent::Error {
                        message: format!("Stream error: {}", e),
                    }).await;
                    return Err(AgentError::LLM(e.to_string()));
                }
            }
        }

        let llm_duration = timer.elapsed_ms();
        timer.debug(&session_id);
        log::debug!("[{}] LLM response completed in {}ms, {} tokens received", 
            session_id, llm_duration, token_count);

        // 将部分工具调用转换为完整工具调用
        let accumulated_tool_calls = finalize_tool_calls(current_tool_call_parts);
        log::debug!("[{}] Finalized {} tool calls", session_id, accumulated_tool_calls.len());

        // 如果没有工具调用，发送 Complete 事件并结束
        if accumulated_tool_calls.is_empty() {
            log::debug!("[{}] No tool calls, completing", session_id);
            
            // 添加 assistant 消息到历史
            session.add_message(Message::assistant(
                accumulated_content.clone(),
                None,
            ));

            log::debug!("[{}] Added assistant message, content length: {}", 
                session_id, accumulated_content.len());

            // 发送完成事件
            let _ = event_tx.send(AgentEvent::Complete {
                usage: TokenUsage {
                    prompt_tokens: 0,
                    completion_tokens: token_count as u32,
                    total_tokens: token_count as u32,
                },
            }).await;
            sent_complete = true;

            debug_logger.log_event(&session_id, "agent_loop_complete", serde_json::json!({
                "rounds": round + 1,
                "total_tokens": token_count,
                "final_message_count": session.messages.len(),
            }));

            break;
        }

        // 有工具调用，继续循环
        log::debug!("[{}] Processing {} tool calls", session_id, accumulated_tool_calls.len());
        
        // 添加 assistant 消息（带工具调用）
        session.add_message(Message::assistant(
            accumulated_content.clone(),
            Some(accumulated_tool_calls.clone()),
        ));

        // 执行工具
        for (idx, tool_call) in accumulated_tool_calls.iter().enumerate() {
            log::debug!("[{}] Executing tool {}/{}: {}", 
                session_id, idx + 1, accumulated_tool_calls.len(), tool_call.function.name);
            
            // 解析参数
            let args_raw = tool_call.function.arguments.trim();
            let args: serde_json::Value = if args_raw.is_empty() {
                serde_json::json!({})
            } else {
                serde_json::from_str(args_raw).unwrap_or_else(|_| serde_json::json!({}))
            };
            
            log::debug!("[{}] Tool {} arguments: {}", session_id, tool_call.function.name, args);
            
            debug_logger.log_event(&session_id, "tool_start", serde_json::json!({
                "tool_name": tool_call.function.name.clone(),
                "tool_call_id": tool_call.id.clone(),
                "arguments": args.clone(),
            }));
            
            // 发送 ToolStart 事件
            let _ = event_tx.send(AgentEvent::ToolStart {
                tool_call_id: tool_call.id.clone(),
                tool_name: tool_call.function.name.clone(),
                arguments: args.clone(),
            }).await;

            let tool_timer = Timer::new(&format!("tool_{}", tool_call.function.name));
            
            // 执行工具
            match tools.execute(tool_call).await {
                Ok(result) => {
                    let tool_duration = tool_timer.elapsed_ms();
                    log::debug!("[{}] Tool {} completed in {}ms, success: {}, result length: {}",
                        session_id, tool_call.function.name, tool_duration, 
                        result.success, result.result.len());
                    
                    debug_logger.log_event(&session_id, "tool_complete", serde_json::json!({
                        "tool_name": tool_call.function.name.clone(),
                        "tool_call_id": tool_call.id.clone(),
                        "duration_ms": tool_duration,
                        "success": result.success,
                        "result_preview": &result.result[..result.result.len().min(100)],
                    }));
                    
                    // 发送 ToolComplete 事件
                    let _ = event_tx.send(AgentEvent::ToolComplete {
                        tool_call_id: tool_call.id.clone(),
                        result: result.clone(),
                    }).await;

                    // 添加 tool 结果到历史
                    session.add_message(Message::tool_result(
                        tool_call.id.clone(),
                        result.result.clone(),
                    ));
                }
                Err(e) => {
                    let error_msg = e.to_string();
                    log::error!("[{}] Tool {} failed: {}", session_id, tool_call.function.name, error_msg);
                    
                    debug_logger.log_event(&session_id, "tool_error", serde_json::json!({
                        "tool_name": tool_call.function.name.clone(),
                        "tool_call_id": tool_call.id.clone(),
                        "error": error_msg.clone(),
                    }));
                    
                    // 发送 ToolError 事件
                    let _ = event_tx.send(AgentEvent::ToolError {
                        tool_call_id: tool_call.id.clone(),
                        error: error_msg.clone(),
                    }).await;

                    // 添加错误结果到历史
                    session.add_message(Message::tool_result(
                        tool_call.id.clone(),
                        format!("Error: {}", error_msg),
                    ));
                }
            }
        }

        log::debug!("[{}] Round {} completed", session_id, round + 1);
        debug_logger.log_event(&session_id, "round_complete", serde_json::json!({
            "round": round + 1,
            "message_count": session.messages.len(),
        }));

        // 继续下一轮循环
    }

    if !sent_complete {
        let _ = event_tx.send(AgentEvent::Complete {
            usage: TokenUsage {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
            },
        }).await;
    }

    log::debug!("[{}] Agent loop completed, final message count: {}", 
        session_id, session.messages.len());
    
    // 3. 保存会话到 storage（由调用者处理）
    Ok(())
}

// 部分工具调用累积结构
#[derive(Clone)]
struct PartialToolCall {
    id: String,
    tool_type: String,
    name: String,
    arguments: String,
}

fn update_partial_tool_call(parts: &mut Vec<PartialToolCall>, call: ToolCall) {
    if call.id.is_empty()
        && call.function.name.is_empty()
        && call.function.arguments.is_empty()
    {
        return;
    }

    if call.id.is_empty() && call.function.name.is_empty() {
        if let Some(last) = parts.last_mut() {
            last.arguments.push_str(&call.function.arguments);
        } else {
            parts.push(PartialToolCall {
                id: String::new(),
                tool_type: call.tool_type.clone(),
                name: String::new(),
                arguments: call.function.arguments.clone(),
            });
        }
        return;
    }

    // 查找现有部分或创建新的
    let existing = if !call.id.is_empty() {
        parts.iter_mut().find(|p| p.id == call.id)
    } else if !call.function.name.is_empty() {
        parts.iter_mut().find(|p| {
            (p.id.is_empty() && p.name == call.function.name)
                || (p.id.is_empty() && p.name.is_empty())
        })
    } else {
        None
    };

    if let Some(existing) = existing {
        // 累积参数
        existing.arguments.push_str(&call.function.arguments);
        if !call.function.name.is_empty() {
            existing.name = call.function.name.clone();
        }
        if !call.tool_type.is_empty() {
            existing.tool_type = call.tool_type.clone();
        }
    } else {
        log::debug!("New tool call part: id={}, name={}", call.id, call.function.name);
        parts.push(PartialToolCall {
            id: call.id.clone(),
            tool_type: call.tool_type.clone(),
            name: call.function.name.clone(),
            arguments: call.function.arguments.clone(),
        });
    }
}

fn finalize_tool_calls(parts: Vec<PartialToolCall>) -> Vec<ToolCall> {
    parts
        .into_iter()
        .filter(|p| !p.name.trim().is_empty())
        .map(|p| {
            log::debug!("Finalizing tool call: {} (args length: {})", p.name, p.arguments.len());
            ToolCall {
                id: if p.id.is_empty() {
                    format!("call_{}", Uuid::new_v4())
                } else {
                    p.id
                },
                tool_type: if p.tool_type.is_empty() {
                    "function".to_string()
                } else {
                    p.tool_type
                },
                function: copilot_agent_core::tools::FunctionCall {
                    name: p.name,
                    arguments: p.arguments,
                },
            }
        })
        .collect()
}

/// Backward-compatible wrapper for run_agent_loop
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
            ..Default::default()
        },
    ).await
}
