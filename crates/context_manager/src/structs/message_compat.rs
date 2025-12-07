//! Backward compatibility layer for message types
//!
//! This module provides compatibility between the old message format and the new RichMessageType system.
//! It enables gradual migration without breaking existing code.

use crate::structs::message::{ContentPart, InternalMessage, MessageType, Role};
use crate::structs::message_types::*;
use crate::structs::tool::{
    ApprovalStatus as OldApprovalStatus, DisplayPreference, ToolCallRequest, ToolCallResult,
};
use chrono::Utc;
use tool_system::types::ToolArguments;

#[cfg(test)]
use std::collections::HashMap;

/// Extension trait to convert from old message format to rich message types
pub trait ToRichMessage {
    /// Convert to a RichMessageType
    fn to_rich_message_type(&self) -> Option<RichMessageType>;
}

impl ToRichMessage for InternalMessage {
    fn to_rich_message_type(&self) -> Option<RichMessageType> {
        // Based on the MessageType and available fields, convert to appropriate RichMessageType
        match self.message_type {
            MessageType::Text => {
                // Extract text content
                let text_content = self
                    .content
                    .iter()
                    .filter_map(|part| part.text_content())
                    .collect::<Vec<_>>()
                    .join("\n");

                Some(RichMessageType::Text(TextMessage::new(text_content)))
            }
            MessageType::ToolCall => {
                // Convert tool calls to ToolRequest
                if let Some(tool_calls) = &self.tool_calls {
                    let calls: Vec<ToolCall> = tool_calls
                        .iter()
                        .map(|tc| ToolCall {
                            id: tc.id.clone(),
                            name: tc.tool_name.clone(),
                            arguments: match &tc.arguments {
                                ToolArguments::Json(v) => v.clone(),
                                ToolArguments::String(s) => serde_json::json!(s),
                                ToolArguments::StringList(list) => serde_json::json!(list),
                            },
                        })
                        .collect();

                    // Use the approval status from the first tool call
                    let approval_status = tool_calls
                        .first()
                        .map(|tc| match tc.approval_status {
                            OldApprovalStatus::Pending => ApprovalStatus::Pending,
                            OldApprovalStatus::Approved => ApprovalStatus::Approved,
                            OldApprovalStatus::Denied => ApprovalStatus::Denied,
                        })
                        .unwrap_or(ApprovalStatus::Pending);

                    Some(RichMessageType::ToolRequest(ToolRequestMessage {
                        calls,
                        approval_status,
                        requested_at: Utc::now(),
                        approved_at: None,
                        approved_by: None,
                    }))
                } else {
                    None
                }
            }
            MessageType::ToolResult => {
                // Convert tool result
                if let Some(tool_result) = &self.tool_result {
                    Some(RichMessageType::ToolResult(ToolResultMessage {
                        request_id: tool_result.request_id.clone(),
                        result: tool_result.result.clone(),
                        status: ExecutionStatus::Success,
                        executed_at: Utc::now(),
                        duration_ms: 0, // Not tracked in old format
                        error: None,
                    }))
                } else {
                    None
                }
            }
            MessageType::Plan | MessageType::Question => {
                // Treat as enhanced text messages
                let text_content = self
                    .content
                    .iter()
                    .filter_map(|part| part.text_content())
                    .collect::<Vec<_>>()
                    .join("\n");

                Some(RichMessageType::Text(TextMessage::new(text_content)))
            }
        }
    }
}

/// Extension trait to convert from rich message types back to old format
pub trait FromRichMessage {
    /// Create from a RichMessageType
    fn from_rich_message_type(rich: &RichMessageType, role: Role) -> Self;
}

impl FromRichMessage for InternalMessage {
    fn from_rich_message_type(rich: &RichMessageType, role: Role) -> Self {
        match rich {
            RichMessageType::Text(text_msg) => InternalMessage {
                role,
                content: vec![ContentPart::text(&text_msg.content)],
                tool_calls: None,
                tool_result: None,
                metadata: None,
                message_type: MessageType::Text,
                rich_type: None,
            },

            RichMessageType::Image(_) => {
                // Images need special handling - not implemented yet
                InternalMessage {
                    role,
                    content: vec![ContentPart::text("[Image content - not yet implemented]")],
                    tool_calls: None,
                    tool_result: None,
                    metadata: None,
                    message_type: MessageType::Text,
                    rich_type: None,
                }
            }

            RichMessageType::FileReference(file_ref) => {
                // If resolved, use the resolved content; otherwise show path
                let content_text = file_ref
                    .resolved_content
                    .as_ref()
                    .map(|c| format!("File: {}\n\n{}", file_ref.path, c))
                    .unwrap_or_else(|| format!("File reference: {}", file_ref.path));

                InternalMessage {
                    role,
                    content: vec![ContentPart::text(&content_text)],
                    tool_calls: None,
                    tool_result: None,
                    metadata: None,
                    message_type: MessageType::Text,
                    rich_type: None,
                }
            }

            RichMessageType::ProjectStructure(proj) => {
                let content_text = format!(
                    "Project structure at: {}\nType: {:?}\nGenerated at: {}",
                    proj.root_path.display(),
                    proj.structure_type,
                    proj.generated_at
                );

                InternalMessage {
                    role,
                    content: vec![ContentPart::text(&content_text)],
                    tool_calls: None,
                    tool_result: None,
                    metadata: None,
                    message_type: MessageType::Text,
                    rich_type: None,
                }
            }

            RichMessageType::ToolRequest(tool_req) => {
                let tool_calls = tool_req
                    .calls
                    .iter()
                    .map(|tc| ToolCallRequest {
                        id: tc.id.clone(),
                        tool_name: tc.name.clone(),
                        arguments: ToolArguments::Json(tc.arguments.clone()),
                        approval_status: match tool_req.approval_status {
                            ApprovalStatus::Pending => OldApprovalStatus::Pending,
                            ApprovalStatus::Approved | ApprovalStatus::AutoApproved => {
                                OldApprovalStatus::Approved
                            }
                            ApprovalStatus::Denied => OldApprovalStatus::Denied,
                        },
                        display_preference: DisplayPreference::Default,
                        ui_hints: None,
                    })
                    .collect();

                InternalMessage {
                    role,
                    content: vec![],
                    tool_calls: Some(tool_calls),
                    tool_result: None,
                    metadata: None,
                    message_type: MessageType::ToolCall,
                    rich_type: None,
                }
            }

            RichMessageType::ToolResult(tool_res) => InternalMessage {
                role,
                content: vec![],
                tool_calls: None,
                tool_result: Some(ToolCallResult {
                    request_id: tool_res.request_id.clone(),
                    result: tool_res.result.clone(),
                    display_preference: DisplayPreference::Default,
                }),
                metadata: None,
                message_type: MessageType::ToolResult,
                rich_type: None,
            },

            RichMessageType::MCPToolRequest(mcp_req) => {
                // MCP tools are converted to regular tool calls for now
                let tool_call = ToolCallRequest {
                    id: mcp_req.request_id.clone(),
                    tool_name: format!("{}::{}", mcp_req.server_name, mcp_req.tool_name),
                    arguments: ToolArguments::Json(serde_json::json!({
                        "server": mcp_req.server_name,
                        "tool": mcp_req.tool_name,
                        "args": mcp_req.arguments
                    })),
                    approval_status: match mcp_req.approval_status {
                        ApprovalStatus::Pending => OldApprovalStatus::Pending,
                        ApprovalStatus::Approved | ApprovalStatus::AutoApproved => {
                            OldApprovalStatus::Approved
                        }
                        ApprovalStatus::Denied => OldApprovalStatus::Denied,
                    },
                    display_preference: DisplayPreference::Default,
                    ui_hints: None,
                };

                InternalMessage {
                    role,
                    content: vec![],
                    tool_calls: Some(vec![tool_call]),
                    tool_result: None,
                    metadata: None,
                    message_type: MessageType::ToolCall,
                    rich_type: None,
                }
            }

            RichMessageType::MCPToolResult(mcp_res) => {
                // Wrap MCP result with server info
                let wrapped_result = serde_json::json!({
                    "server": mcp_res.server_name,
                    "tool": mcp_res.tool_name,
                    "result": mcp_res.result
                });

                InternalMessage {
                    role,
                    content: vec![],
                    tool_calls: None,
                    tool_result: Some(ToolCallResult {
                        request_id: mcp_res.request_id.clone(),
                        result: wrapped_result,
                        display_preference: DisplayPreference::Default,
                    }),
                    metadata: None,
                    message_type: MessageType::ToolResult,
                    rich_type: None,
                }
            }

            RichMessageType::MCPResource(mcp_res) => {
                let content_text = format!(
                    "MCP Resource: {}\nFrom server: {}\nRetrieved at: {}\n\n{}",
                    mcp_res.resource_uri,
                    mcp_res.server_name,
                    mcp_res.retrieved_at,
                    mcp_res.content
                );

                InternalMessage {
                    role,
                    content: vec![ContentPart::text(&content_text)],
                    tool_calls: None,
                    tool_result: None,
                    metadata: None,
                    message_type: MessageType::Text,
                    rich_type: None,
                }
            }

            RichMessageType::WorkflowExecution(workflow) => {
                // Prompt Injection:
                // We format this Rich Message into strict instructions for the AI.
                // The AI sees this content as the User's message.
                let content_text = format!(
                    "*** SYSTEM INSTRUCTION: WORKFLOW EXECUTION ***\n\
                    You are about to execute the workflow '{}'.\n\
                    \n\
                    Step 1: PLAN\n\
                    - You MUST first generate a Markdown Todo List for this workflow.\n\
                    - Use the format: `- [ ] step description`\n\
                    - Do NOT use numbered lists (1. 2. 3.).\n\
                    - STOP after generating the plan. Do NOT execute step 1 yet.\n\
                    - Output marker: `<!-- AGENT_CONTINUE: plan approved, starting step 1 -->`\n\
                    \n\
                    Step 2: EXECUTE\n\
                    - After the user continues, execute ONE step at a time.\n\
                    - Mark completed steps as `- [x]`.\n\
                    - Output marker: `<!-- AGENT_CONTINUE: proceeding to step X -->`\n\
                    \n\
                    Follow this process strictly.\n\
                    \n\
                    workflow status: {:?}\nprogress: {}/{} steps\ncurrent step: {:?}",
                    workflow.workflow_name,
                    workflow.status,
                    workflow.completed_steps,
                    workflow.total_steps,
                    workflow.current_step
                );

                InternalMessage {
                    role,
                    content: vec![ContentPart::text(&content_text)],
                    tool_calls: None,
                    tool_result: None,
                    metadata: None,
                    message_type: MessageType::Text,
                    rich_type: Some(RichMessageType::WorkflowExecution(workflow.clone())),
                }
            }

            RichMessageType::SystemControl(sys_msg) => {
                let content_text = format!("System Control: {:?}", sys_msg.control_type);

                InternalMessage {
                    role,
                    content: vec![ContentPart::text(&content_text)],
                    tool_calls: None,
                    tool_result: None,
                    metadata: None,
                    message_type: MessageType::Text,
                    rich_type: None,
                }
            }

            RichMessageType::Processing(proc_msg) => {
                let content_text = format!("Processing: {:?}", proc_msg.stage);

                InternalMessage {
                    role,
                    content: vec![ContentPart::text(&content_text)],
                    tool_calls: None,
                    tool_result: None,
                    metadata: None,
                    message_type: MessageType::Text,
                    rich_type: None,
                }
            }

            RichMessageType::StreamingResponse(streaming_msg) => {
                // Use the complete accumulated content
                InternalMessage {
                    role,
                    content: vec![ContentPart::text(&streaming_msg.content)],
                    tool_calls: None,
                    tool_result: None,
                    metadata: None,
                    message_type: MessageType::Text,
                    rich_type: None,
                }
            }

            RichMessageType::TodoList(todo_list) => {
                let content_text = format!(
                    "# {}\n\nTODO List ({} items, Status: {:?})\n\nProgress: {}%\n\nItems:\n{}",
                    todo_list.title,
                    todo_list.items.len(),
                    todo_list.status,
                    todo_list.completion_percentage(),
                    todo_list
                        .items
                        .iter()
                        .map(|item| format!("[{:?}] {}", item.status, item.description))
                        .collect::<Vec<_>>()
                        .join("\n")
                );

                InternalMessage {
                    role,
                    content: vec![ContentPart::text(&content_text)],
                    tool_calls: None,
                    tool_result: None,
                    metadata: None,
                    message_type: MessageType::Text,
                    rich_type: None,
                }
            }
        }
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_text_message_conversion() {
        let old_msg = InternalMessage {
            role: Role::User,
            content: vec![ContentPart::text("Hello, world!")],
            tool_calls: None,
            tool_result: None,
            metadata: None,
            message_type: MessageType::Text,
            rich_type: None,
        };

        let rich = old_msg.to_rich_message_type().unwrap();
        match &rich {
            RichMessageType::Text(text_msg) => {
                assert_eq!(text_msg.content, "Hello, world!");
            }
            _ => panic!("Expected Text variant"),
        }

        // Convert back
        let converted_back = InternalMessage::from_rich_message_type(&rich, Role::User);
        assert_eq!(converted_back.role, Role::User);
        assert_eq!(converted_back.message_type, MessageType::Text);
    }

    #[test]
    fn test_tool_call_conversion() {
        let old_msg = InternalMessage {
            role: Role::Assistant,
            content: vec![],
            tool_calls: Some(vec![ToolCallRequest {
                id: "call-123".to_string(),
                tool_name: "read_file".to_string(),
                arguments: ToolArguments::Json(serde_json::json!({"path": "test.rs"})),
                approval_status: OldApprovalStatus::Pending,
                display_preference: DisplayPreference::Default,
                ui_hints: None,
            }]),
            tool_result: None,
            metadata: None,
            message_type: MessageType::ToolCall,
            rich_type: None,
        };

        let rich = old_msg.to_rich_message_type().unwrap();
        match rich {
            RichMessageType::ToolRequest(tool_req) => {
                assert_eq!(tool_req.calls.len(), 1);
                assert_eq!(tool_req.calls[0].name, "read_file");
            }
            _ => panic!("Expected ToolRequest variant"),
        }
    }

    #[test]
    fn test_rich_to_old_text() {
        let rich = RichMessageType::Text(TextMessage::new("Test content"));
        let old = InternalMessage::from_rich_message_type(&rich, Role::Assistant);

        assert_eq!(old.role, Role::Assistant);
        assert_eq!(old.message_type, MessageType::Text);
        assert_eq!(
            old.content.first().unwrap().text_content(),
            Some("Test content")
        );
    }

    #[test]
    fn test_file_reference_conversion() {
        let file_ref = FileRefMessage {
            path: "src/main.rs".to_string(),
            line_range: Some((10, 20)),
            resolved_content: Some("fn main() {}".to_string()),
            resolved_at: Some(Utc::now()),
            resolution_error: None,
            metadata: None,
        };

        let rich = RichMessageType::FileReference(file_ref);
        let old = InternalMessage::from_rich_message_type(&rich, Role::User);

        assert_eq!(old.role, Role::User);
        let text = old.content.first().unwrap().text_content().unwrap();
        assert!(text.contains("src/main.rs"));
        assert!(text.contains("fn main() {}"));
    }

    #[test]
    fn test_mcp_tool_conversion() {
        let mut args = HashMap::new();
        args.insert("query".to_string(), serde_json::json!("test"));

        let mcp_req = MCPToolRequestMsg {
            server_name: "test-server".to_string(),
            tool_name: "search".to_string(),
            arguments: args,
            request_id: "req-123".to_string(),
            approval_status: ApprovalStatus::Pending,
            requested_at: Utc::now(),
            approved_at: None,
        };

        let rich = RichMessageType::MCPToolRequest(mcp_req);
        let old = InternalMessage::from_rich_message_type(&rich, Role::Assistant);

        assert_eq!(old.message_type, MessageType::ToolCall);
        assert!(old.tool_calls.is_some());
        let tool_call = &old.tool_calls.unwrap()[0];
        assert!(tool_call.tool_name.contains("test-server"));
        assert!(tool_call.tool_name.contains("search"));
    }

    #[test]
    fn test_workflow_conversion() {
        let workflow = WorkflowExecMsg {
            workflow_name: "deploy".to_string(),
            execution_id: "exec-123".to_string(),
            status: WorkflowStatus::Running,
            current_step: Some("build".to_string()),
            total_steps: 5,
            completed_steps: 2,
            started_at: Utc::now(),
            updated_at: Utc::now(),
            result: None,
            error: None,
        };

        let rich = RichMessageType::WorkflowExecution(workflow);
        let old = InternalMessage::from_rich_message_type(&rich, Role::Assistant);

        assert_eq!(old.message_type, MessageType::Text);
        let text = old.content.first().unwrap().text_content().unwrap();
        assert!(text.contains("deploy"));
        assert!(text.contains("2/5"));
    }
}
