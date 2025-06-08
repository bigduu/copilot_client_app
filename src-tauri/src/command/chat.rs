use log::{debug, error, info};
use serde_json::json;
use std::sync::Arc;

use crate::{
    copilot::{model::stream_model::Message, CopilotClient},
    tools::ToolManager,
};

#[derive(Debug, Clone)]
pub struct ToolCallRequest {
    pub tool_name: String,
    pub user_description: String,
}

fn parse_tool_call_format(content: &str) -> Option<ToolCallRequest> {
    if content.starts_with('/') {
        // Handle case where user just typed tool name without description
        if let Some(space_pos) = content.find(' ') {
            let tool_name = content[1..space_pos].to_string();
            let user_description = content[space_pos + 1..].to_string();
            return Some(ToolCallRequest {
                tool_name,
                user_description,
            });
        } else {
            // Handle case where user just typed "/toolname" without space or description
            let tool_name = content[1..].to_string();
            if !tool_name.is_empty() {
                return Some(ToolCallRequest {
                    tool_name,
                    user_description: "".to_string(),
                });
            }
        }
    }
    None
}

async fn handle_tool_call_request(
    messages: Vec<Message>,
    tool_call: ToolCallRequest,
    model: Option<String>,
    copilot_client: &CopilotClient,
    tool_manager: Arc<ToolManager>,
    channel: tauri::ipc::Channel<String>,
) -> Result<(), String> {
    info!("=== HANDLING TOOL CALL: {} ===", tool_call.tool_name);

    // Send processor update to indicate tool call parsing
    let _ = channel.send(format!(
        "data:{}",
        json!({
            "type": "processor_update",
            "source": "ToolCallHandler",
            "content": format!("Parsing tool call: /{} {}", tool_call.tool_name, tool_call.user_description)
        }).to_string()
    ));

    // 1. Verify tool exists
    let tool = match tool_manager.get_tool(&tool_call.tool_name) {
        Some(tool) => tool,
        None => {
            let error_msg = format!(
                "Tool '{}' not found. Available tools: {}",
                tool_call.tool_name,
                tool_manager.list_tools()
            );
            let _ = channel.send(format!(
                "data:{}",
                json!({
                    "choices": [{
                        "delta": {"content": error_msg},
                        "finish_reason": null
                    }]
                })
                .to_string()
            ));
            let _ = channel.send("data:[DONE]".to_string());
            return Ok(());
        }
    };

    // Send processor update for parameter parsing
    let _ = channel.send(format!(
        "data:{}",
        json!({
            "type": "processor_update",
            "source": "ToolCallHandler",
            "content": format!("Analyzing parameters for tool: {}", tool_call.tool_name)
        })
        .to_string()
    ));

    // 2. Parse parameters using AI
    let parameter_parsing_messages = vec![
        Message {
            role: "system".to_string(),
            content: format!(
                "You are a parameter parser for tool execution. Based on the user's description, extract the required parameters for the tool and return ONLY the parameter values in the exact format needed.\n\nTool: {}\nDescription: {}\nParameters: {:?}\n\nFor execute_command tool, return only the shell command.\nFor create_file tool, return the file path and content separated by '|||'.\nFor read_file/delete_file tools, return only the file path.\n\nUser request: {}\n\nRespond with only the parameter value(s), no explanation:",
                tool.name(),
                tool.description(),
                tool.parameters(),
                tool_call.user_description
            ),
        },
        Message {
            role: "user".to_string(),
            content: tool_call.user_description.clone(),
        }
    ];

    // Get AI to parse parameters
    let (mut param_rx, param_handle) = copilot_client
        .send_stream_request(parameter_parsing_messages, model.clone())
        .await;
    let mut parameter_response = String::new();

    while let Some(message) = param_rx.recv().await {
        match message {
            Ok(bytes) => {
                let result = String::from_utf8_lossy(&bytes);
                // Extract content from streaming response
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&result) {
                    if let Some(choices) = parsed.get("choices").and_then(|v| v.as_array()) {
                        if let Some(choice) = choices.first() {
                            if let Some(delta) = choice.get("delta").and_then(|v| v.as_object()) {
                                if let Some(content) = delta.get("content").and_then(|v| v.as_str())
                                {
                                    parameter_response.push_str(content);
                                }
                            }
                        }
                    }
                } else {
                    // If not valid JSON, might be raw text response
                    debug!("Non-JSON response: {}", result);
                }
            }
            Err(e) => {
                error!("Error parsing parameters: {e}");
                break;
            }
        }
    }
    let _ = param_handle.await;

    info!("AI parsed parameters: '{}'", parameter_response.trim());

    // Check if parameter response is empty
    if parameter_response.trim().is_empty() {
        error!(
            "AI returned empty parameters for tool: {}",
            tool_call.tool_name
        );
        let error_msg = "AI failed to parse parameters - empty response";
        let _ = channel.send(format!(
            "data:{}",
            json!({
                "choices": [{
                    "delta": {"content": error_msg},
                    "finish_reason": null
                }]
            })
            .to_string()
        ));
        let _ = channel.send("data:[DONE]".to_string());
        return Ok(());
    }

    // Send processor update for tool execution
    let _ = channel.send(format!(
        "data:{}",
        json!({
            "type": "processor_update",
            "source": "ToolCallHandler",
            "content": format!("Executing tool: {}", tool_call.tool_name)
        })
        .to_string()
    ));

    // 3. Execute tool with AI-parsed parameters
    let parsed_params = parameter_response.trim();
    let tool_parameters = tool
        .parameters()
        .into_iter()
        .map(|mut param| {
            // Use AI-parsed parameters based on tool type
            match tool.name().as_str() {
                "execute_command" => {
                    if param.name == "command" {
                        param.value = parsed_params.to_string();
                    }
                }
                "create_file" => {
                    if parsed_params.contains("|||") {
                        let parts: Vec<&str> = parsed_params.split("|||").collect();
                        if param.name == "path" && parts.len() > 0 {
                            param.value = parts[0].trim().to_string();
                        } else if param.name == "content" && parts.len() > 1 {
                            param.value = parts[1].trim().to_string();
                        }
                    } else {
                        // Fallback: use original description
                        if param.name == "path" {
                            param.value = "test.txt".to_string();
                        } else if param.name == "content" {
                            param.value = tool_call.user_description.clone();
                        }
                    }
                }
                "read_file" | "delete_file" => {
                    if param.name == "path" {
                        // For read_file, use the parsed parameters as the file path
                        param.value = parsed_params.to_string();
                    }
                    // For read_file, other parameters (start_line, end_line) remain empty unless specified
                }
                _ => {
                    // Default: use AI-parsed parameters
                    param.value = parsed_params.to_string();
                }
            }
            param
        })
        .collect();

    info!("Executing tool with parameters: {:?}", tool_parameters);
    let tool_result = match tool.execute(tool_parameters).await {
        Ok(result) => {
            info!("Tool execution successful. Result length: {}", result.len());
            result
        }
        Err(e) => {
            error!("Tool execution failed: {}", e);
            let error_msg = format!("Tool execution failed: {}", e);
            let _ = channel.send(format!(
                "data:{}",
                json!({
                    "choices": [{
                        "delta": {"content": error_msg},
                        "finish_reason": null
                    }]
                })
                .to_string()
            ));
            let _ = channel.send("data:[DONE]".to_string());
            return Ok(());
        }
    };

    // Send processor update for response generation
    let _ = channel.send(format!(
        "data:{}",
        json!({
            "type": "processor_update",
            "source": "ToolCallHandler",
            "content": "Returning tool execution results"
        })
        .to_string()
    ));

    // 4. Send tool result directly as streaming response
    let formatted_result = format!(
        "**Tool: {}**\n\n**Parameters:** {}\n\n**Result:**\n```\n{}\n```",
        tool_call.tool_name, parsed_params, tool_result
    );

    // Split the result into chunks and send as streaming response
    let chunk_size = 50; // Send in small chunks to simulate streaming
    let chars: Vec<char> = formatted_result.chars().collect();

    for chunk in chars.chunks(chunk_size) {
        let chunk_str: String = chunk.iter().collect();
        let _ = channel.send(format!(
            "data:{}",
            json!({
                "choices": [{
                    "delta": {"content": chunk_str},
                    "finish_reason": null
                }]
            })
            .to_string()
        ));

        // Small delay to make streaming visible
        tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
    }

    // Send completion marker
    let _ = channel.send(format!(
        "data:{}",
        json!({
            "choices": [{
                "delta": {"content": ""},
                "finish_reason": "stop"
            }]
        })
        .to_string()
    ));

    let _ = channel.send("data:[DONE]".to_string());
    Ok(())
}

async fn send_direct_llm_request(
    messages: Vec<Message>,
    model: Option<String>,
    copilot_client: &CopilotClient,
    channel: tauri::ipc::Channel<String>,
) -> Result<(), String> {
    info!("=== SENDING DIRECT LLM REQUEST ===");

    let (mut rx, handle) = copilot_client.send_stream_request(messages, model).await;

    tokio::spawn(async move {
        while let Some(message) = rx.recv().await {
            match message {
                Ok(bytes) => {
                    let result = String::from_utf8_lossy(&bytes);
                    debug!("Direct LLM response: {result}");
                    let _ = channel.send(result.to_string());
                }
                Err(e) => {
                    error!("Error in direct LLM response: {e}");
                    let _ = channel.send(format!(r#"{{\"error\": "{e}"}}"#));
                }
            }
        }
    });

    let _ = handle.await.unwrap();
    Ok(())
}

#[tauri::command(async)]
pub async fn execute_prompt(
    messages: Vec<Message>,
    model: Option<String>,
    copilot_client: tauri::State<'_, CopilotClient>,
    tool_manager: tauri::State<'_, Arc<ToolManager>>,
    channel: tauri::ipc::Channel<String>,
) -> Result<(), String> {
    info!("=== EXECUTE_PROMPT START ===");

    if let Some(last_msg) = messages.last() {
        info!("Latest message: {}", last_msg.content);

        // Check if this is a tool call format
        if let Some(tool_call) = parse_tool_call_format(&last_msg.content) {
            return handle_tool_call_request(
                messages,
                tool_call,
                model,
                &copilot_client,
                tool_manager.inner().clone(),
                channel,
            )
            .await;
        }
    }

    // Regular message - send directly to LLM
    send_direct_llm_request(messages, model, &copilot_client, channel).await
}

#[tauri::command(async)]
pub async fn get_models(state: tauri::State<'_, CopilotClient>) -> Result<Vec<String>, String> {
    let client = state.clone();
    match client.get_models().await {
        Ok(models) => Ok(models),
        Err(e) => Err(format!("Failed to get models: {e}")),
    }
}
