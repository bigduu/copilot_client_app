use crate::models::{ClientMessageMetadata, MessagePayload, SendMessageRequest};
use context_manager::{IncomingMessage, IncomingTextMessage, MessageMetadata};
use serde_json::json;

/// Helper module for building and formatting messages
///
/// This module contains utilities for:
/// - Converting client payloads to internal messages
/// - Computing display text from various payload types
/// - Formatting tool output for display
/// - Converting client metadata to internal format

/// Format tool output value for display
///
/// Extracts content or message fields if present, otherwise pretty-prints JSON
pub fn stringify_tool_output(value: &serde_json::Value) -> String {
    if let Some(content) = value.get("content").and_then(|v| v.as_str()) {
        return content.to_string();
    }

    if let Some(message) = value.get("message").and_then(|v| v.as_str()) {
        return message.to_string();
    }

    serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string())
}

/// Describe the type of message payload
///
/// Returns a static string describing the payload type for logging/debugging
pub fn describe_payload(payload: &MessagePayload) -> &'static str {
    match payload {
        MessagePayload::Text { .. } => "text",
        MessagePayload::FileReference { .. } => "file_reference",
        MessagePayload::Workflow { .. } => "workflow",
        MessagePayload::ToolResult { .. } => "tool_result",
    }
}

/// Compute display text from a SendMessageRequest
///
/// Priority:
/// 1. client_metadata.display_text
/// 2. Payload-specific display field
/// 3. Auto-generated description
pub fn compute_display_text(request: &SendMessageRequest) -> String {
    if let Some(display_text) = &request.client_metadata.display_text {
        return display_text.clone();
    }

    match &request.payload {
        MessagePayload::Text { content, display } => {
            display.clone().unwrap_or_else(|| content.clone())
        }
        MessagePayload::FileReference {
            paths,
            display_text,
            ..
        } => display_text
            .clone()
            .unwrap_or_else(|| format!("读取文件 {:?}", paths)),
        MessagePayload::Workflow {
            workflow,
            display_text,
            ..
        } => display_text
            .clone()
            .unwrap_or_else(|| format!("执行工作流 {}", workflow)),
        MessagePayload::ToolResult {
            tool_name,
            display_text,
            ..
        } => display_text
            .clone()
            .unwrap_or_else(|| format!("工具 {} 的执行结果", tool_name)),
    }
}

/// Convert client metadata to internal MessageMetadata format
///
/// Merges trace_id into extra fields if present
pub fn convert_client_metadata(metadata: &ClientMessageMetadata) -> Option<MessageMetadata> {
    let mut extra = metadata.extra.clone();

    if let Some(trace_id) = &metadata.trace_id {
        extra
            .entry("trace_id".to_string())
            .or_insert_with(|| json!(trace_id));
    }

    if extra.is_empty() {
        None
    } else {
        Some(MessageMetadata {
            extra: Some(extra),
            ..Default::default()
        })
    }
}

/// Build an IncomingMessage from text content
///
/// Handles display text and metadata conversion
pub fn build_incoming_text_message(
    content: &str,
    payload_display: Option<&str>,
    metadata: &ClientMessageMetadata,
) -> IncomingMessage {
    let display_text = metadata
        .display_text
        .clone()
        .or_else(|| payload_display.map(|value| value.to_string()));

    let mut message = IncomingTextMessage::with_display_text(content.to_string(), display_text);

    if let Some(meta) = convert_client_metadata(metadata) {
        message.metadata = Some(meta);
    }

    IncomingMessage::Text(message)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_stringify_tool_output_content() {
        let value = json!({"content": "Hello World"});
        assert_eq!(stringify_tool_output(&value), "Hello World");
    }

    #[test]
    fn test_stringify_tool_output_message() {
        let value = json!({"message": "Success"});
        assert_eq!(stringify_tool_output(&value), "Success");
    }

    #[test]
    fn test_stringify_tool_output_json() {
        let value = json!({"data": "test"});
        let result = stringify_tool_output(&value);
        assert!(result.contains("data"));
        assert!(result.contains("test"));
    }

    #[test]
    fn test_describe_payload() {
        let text_payload = MessagePayload::Text {
            content: "test".to_string(),
            display: None,
        };
        assert_eq!(describe_payload(&text_payload), "text");
    }
}
