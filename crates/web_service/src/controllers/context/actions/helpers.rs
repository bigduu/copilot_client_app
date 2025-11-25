//! Helper functions for action handlers

use crate::models::MessagePayload;

/// Get the type of a message payload as a string
pub fn payload_type(payload: &MessagePayload) -> &'static str {
    match payload {
        MessagePayload::Text { .. } => "text",
        MessagePayload::FileReference { .. } => "file_reference",
        MessagePayload::Workflow { .. } => "workflow",
        MessagePayload::ToolResult { .. } => "tool_result",
    }
}

/// Get a preview string of a message payload
pub fn payload_preview(payload: &MessagePayload) -> String {
    match payload {
        MessagePayload::Text { content, .. } => content.chars().take(120).collect(),
        MessagePayload::FileReference { paths, .. } => format!("file_reference: {:?}", paths),
        MessagePayload::Workflow { workflow, .. } => format!("workflow: {}", workflow),
        MessagePayload::ToolResult { tool_name, .. } => format!("tool_result: {}", tool_name),
    }
}
