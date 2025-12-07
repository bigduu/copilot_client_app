//! Helper functions for working with InternalMessage
//!
//! This module provides utility functions to create InternalMessage instances
//! using the new RichMessageType system while maintaining backward compatibility.

use crate::structs::message::{InternalMessage, MessageType, Role};
use crate::structs::message_compat::{FromRichMessage, ToRichMessage};
use crate::structs::message_types::*;

#[cfg(test)]
use crate::structs::message::ContentPart;

impl InternalMessage {
    /// Create a new message from a RichMessageType
    pub fn from_rich(role: Role, rich_type: RichMessageType) -> Self {
        // Create base message using the compatibility layer
        let mut message = Self::from_rich_message_type(&rich_type, role);

        // Add the rich_type field
        message.rich_type = Some(rich_type);

        message
    }

    /// Create a simple text message (convenience constructor)
    pub fn text<S: Into<String>>(role: Role, content: S) -> Self {
        let text_msg = TextMessage::new(content.into());
        Self::from_rich(role, RichMessageType::Text(text_msg))
    }

    /// Create an image message (convenience constructor)
    pub fn image(role: Role, image_data: ImageData, mode: ImageRecognitionMode) -> Self {
        let image_msg = ImageMessage {
            image_data,
            recognition_mode: mode,
            recognized_text: None,
            vision_analysis: None,
            error: None,
            recognized_at: None,
        };
        Self::from_rich(role, RichMessageType::Image(image_msg))
    }

    /// Create a file reference message (convenience constructor)
    pub fn file_reference(role: Role, path: String, line_range: Option<(usize, usize)>) -> Self {
        let mut file_ref = FileRefMessage::new(path);
        file_ref.line_range = line_range;
        Self::from_rich(role, RichMessageType::FileReference(file_ref))
    }

    /// Create a tool request message (convenience constructor)
    pub fn tool_request(role: Role, calls: Vec<ToolCall>) -> Self {
        let tool_req = ToolRequestMessage {
            calls,
            approval_status: ApprovalStatus::Pending,
            requested_at: chrono::Utc::now(),
            approved_at: None,
            approved_by: None,
        };
        Self::from_rich(role, RichMessageType::ToolRequest(tool_req))
    }

    /// Create a tool result message (convenience constructor)
    pub fn tool_result(role: Role, request_id: String, result: serde_json::Value) -> Self {
        let tool_res = ToolResultMessage {
            request_id,
            result,
            status: ExecutionStatus::Success,
            executed_at: chrono::Utc::now(),
            duration_ms: 0,
            error: None,
        };
        Self::from_rich(role, RichMessageType::ToolResult(tool_res))
    }

    /// Get the rich message type, converting from legacy format if needed
    pub fn get_rich_type(&self) -> Option<RichMessageType> {
        // If we have a rich_type, use it directly
        if let Some(rich) = &self.rich_type {
            return Some(rich.clone());
        }

        // Otherwise, try to convert from legacy format
        self.to_rich_message_type()
    }

    /// Get a human-readable description of this message
    pub fn describe(&self) -> String {
        if let Some(rich) = self.get_rich_type() {
            match rich {
                RichMessageType::Text(text) => {
                    let preview = if text.content.len() > 50 {
                        format!("{}...", &text.content[..50])
                    } else {
                        text.content.clone()
                    };
                    format!("Text: {}", preview)
                }
                RichMessageType::Image(img) => {
                    let data_desc = match &img.image_data {
                        ImageData::Url(url) => url.clone(),
                        ImageData::Base64 { mime_type, .. } => format!("base64 ({})", mime_type),
                        ImageData::FilePath(path) => format!("file://{}", path.display()),
                    };
                    format!("Image: {} ({:?})", data_desc, img.recognition_mode)
                }
                RichMessageType::FileReference(file) => {
                    if let Some((start, end)) = file.line_range {
                        format!("File: {} (lines {}-{})", file.path, start, end)
                    } else {
                        format!("File: {}", file.path)
                    }
                }
                RichMessageType::ProjectStructure(proj) => {
                    format!(
                        "Project Structure: {} ({:?})",
                        proj.root_path.display(),
                        proj.structure_type
                    )
                }
                RichMessageType::ToolRequest(req) => {
                    let tool_names: Vec<_> = req.calls.iter().map(|c| c.name.as_str()).collect();
                    format!("Tool Request: {}", tool_names.join(", "))
                }
                RichMessageType::ToolResult(res) => {
                    format!("Tool Result: {} ({:?})", res.request_id, res.status)
                }
                RichMessageType::MCPToolRequest(mcp) => {
                    format!("MCP Tool: {}::{}", mcp.server_name, mcp.tool_name)
                }
                RichMessageType::MCPToolResult(mcp) => {
                    format!("MCP Result: {}::{}", mcp.server_name, mcp.tool_name)
                }
                RichMessageType::MCPResource(mcp) => format!("MCP Resource: {}", mcp.resource_uri),
                RichMessageType::WorkflowExecution(wf) => {
                    format!(
                        "Workflow: {} ({:?}, {}/{})",
                        wf.workflow_name, wf.status, wf.completed_steps, wf.total_steps
                    )
                }
                RichMessageType::SystemControl(sys) => format!("System: {:?}", sys.control_type),
                RichMessageType::Processing(proc) => format!("Processing: {:?}", proc.stage),
                RichMessageType::StreamingResponse(streaming) => {
                    let preview = if streaming.content.len() > 50 {
                        format!("{}...", &streaming.content[..50])
                    } else {
                        streaming.content.clone()
                    };
                    format!(
                        "Streaming Response: {} ({} chunks)",
                        preview,
                        streaming.chunks.len()
                    )
                }
                RichMessageType::TodoList(todo_list) => {
                    format!(
                        "TODO: {} ({} items, {:.0}% complete, {:?})",
                        todo_list.title,
                        todo_list.items.len(),
                        todo_list.completion_percentage(),
                        todo_list.status
                    )
                }
            }
        } else {
            // Fallback for legacy messages
            match self.message_type {
                MessageType::Text => "Text message".to_string(),
                MessageType::Plan => "Plan message".to_string(),
                MessageType::Question => "Question message".to_string(),
                MessageType::ToolCall => "Tool call".to_string(),
                MessageType::ToolResult => "Tool result".to_string(),
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
    fn test_text_message_constructor() {
        let msg = InternalMessage::text(Role::User, "Hello, world!");

        assert_eq!(msg.role, Role::User);
        assert!(msg.rich_type.is_some());

        match msg.rich_type.unwrap() {
            RichMessageType::Text(text) => {
                assert_eq!(text.content, "Hello, world!");
            }
            _ => panic!("Expected Text variant"),
        }
    }

    #[test]
    fn test_file_reference_constructor() {
        let msg =
            InternalMessage::file_reference(Role::User, "src/main.rs".to_string(), Some((10, 20)));

        assert_eq!(msg.role, Role::User);
        assert!(msg.rich_type.is_some());

        match msg.rich_type.unwrap() {
            RichMessageType::FileReference(file_ref) => {
                assert_eq!(file_ref.path, "src/main.rs");
                assert_eq!(file_ref.line_range, Some((10, 20)));
            }
            _ => panic!("Expected FileReference variant"),
        }
    }

    #[test]
    fn test_tool_request_constructor() {
        let calls = vec![ToolCall {
            id: "call-123".to_string(),
            name: "read_file".to_string(),
            arguments: serde_json::json!({"path": "test.rs"}),
        }];

        let msg = InternalMessage::tool_request(Role::Assistant, calls);

        assert_eq!(msg.role, Role::Assistant);
        assert!(msg.rich_type.is_some());

        match msg.rich_type.unwrap() {
            RichMessageType::ToolRequest(tool_req) => {
                assert_eq!(tool_req.calls.len(), 1);
                assert_eq!(tool_req.calls[0].name, "read_file");
            }
            _ => panic!("Expected ToolRequest variant"),
        }
    }

    #[test]
    fn test_get_rich_type_with_explicit_rich_type() {
        let msg = InternalMessage::text(Role::User, "Test");
        let rich = msg.get_rich_type();

        assert!(rich.is_some());
        match rich.unwrap() {
            RichMessageType::Text(text) => {
                assert_eq!(text.content, "Test");
            }
            _ => panic!("Expected Text variant"),
        }
    }

    #[test]
    fn test_get_rich_type_from_legacy() {
        let msg = InternalMessage {
            role: Role::User,
            content: vec![ContentPart::text("Legacy message")],
            tool_calls: None,
            tool_result: None,
            metadata: None,
            message_type: MessageType::Text,
            rich_type: None, // No rich type set
        };

        let rich = msg.get_rich_type();
        assert!(rich.is_some());

        match rich.unwrap() {
            RichMessageType::Text(text) => {
                assert_eq!(text.content, "Legacy message");
            }
            _ => panic!("Expected Text variant"),
        }
    }

    #[test]
    fn test_describe_text_message() {
        let msg = InternalMessage::text(Role::User, "Hello, world!");
        let description = msg.describe();

        assert!(description.contains("Text"));
        assert!(description.contains("Hello, world!"));
    }

    #[test]
    fn test_describe_tool_request() {
        let calls = vec![
            ToolCall {
                id: "call-1".to_string(),
                name: "read_file".to_string(),
                arguments: serde_json::json!({}),
            },
            ToolCall {
                id: "call-2".to_string(),
                name: "write_file".to_string(),
                arguments: serde_json::json!({}),
            },
        ];

        let msg = InternalMessage::tool_request(Role::Assistant, calls);
        let description = msg.describe();

        assert!(description.contains("Tool Request"));
        assert!(description.contains("read_file"));
        assert!(description.contains("write_file"));
    }

    #[test]
    fn test_describe_long_text() {
        let long_text = "a".repeat(100);
        let msg = InternalMessage::text(Role::User, &long_text);
        let description = msg.describe();

        // Should be truncated
        assert!(description.len() < 100);
        assert!(description.contains("..."));
    }
}
