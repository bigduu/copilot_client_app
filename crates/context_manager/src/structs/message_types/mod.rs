//! Rich internal message type system
//!
//! This module defines a comprehensive type system for internal messages.
//! Different from the simplified format sent to LLMs, these types capture
//! full processing details for debugging, auditing, and multi-LLM adaptation.

use serde::{Deserialize, Serialize};

// Declare submodules
pub mod files;
pub mod mcp;
pub mod media;
pub mod project;
pub mod streaming;
pub mod system;
pub mod text;
pub mod tools;
pub mod workflow;

// Re-export all public types
pub use files::{FileMetadata, FileRefMessage};
pub use mcp::{MCPResourceMessage, MCPToolRequestMsg, MCPToolResultMsg};
pub use media::{ImageData, ImageMessage, ImageRecognitionMode};
pub use project::{
    Dependency, DependencyGraph, DependencyType, DirectoryNode, FileInfo, ProjectStructMsg,
    ProjectStructureContent, StructureType,
};
pub use streaming::{StreamChunk, StreamingResponseMsg};
pub use system::{ControlType, ProcessingMessage, ProcessingStage, SystemMessage};
pub use text::{TextFormatting, TextMessage};
pub use tools::{
    ApprovalStatus, ErrorDetail, ExecutionStatus, ToolCall, ToolRequestMessage, ToolResultMessage,
};
pub use workflow::{WorkflowExecMsg, WorkflowStatus};

// ============================================================================
// Core Message Type Enum
// ============================================================================

/// Rich internal message types with detailed processing information
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", content = "data", rename_all = "snake_case")]
pub enum RichMessageType {
    /// Plain text message
    Text(TextMessage),

    /// Image message with recognition results
    Image(ImageMessage),

    /// File reference with resolved content (single file)
    FileReference(FileRefMessage),

    /// Project structure information (NEW)
    ProjectStructure(ProjectStructMsg),

    /// Streaming response from LLM with chunk tracking (NEW - Phase 1.5.2)
    StreamingResponse(StreamingResponseMsg),

    /// Regular tool invocation request
    ToolRequest(ToolRequestMessage),

    /// Regular tool execution result
    ToolResult(ToolResultMessage),

    /// MCP tool invocation request (NEW)
    MCPToolRequest(MCPToolRequestMsg),

    /// MCP tool execution result (NEW)
    MCPToolResult(MCPToolResultMsg),

    /// MCP resource message
    MCPResource(MCPResourceMessage),

    /// Workflow execution status (NEW)
    WorkflowExecution(WorkflowExecMsg),

    /// System control message
    SystemControl(SystemMessage),

    /// Processing status message
    Processing(ProcessingMessage),
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use std::collections::HashMap;
    use std::path::PathBuf;

    #[test]
    fn test_text_message_creation() {
        let msg = TextMessage::new("Hello, world!");
        assert_eq!(msg.content, "Hello, world!");
        assert!(msg.display_text.is_none());
    }

    #[test]
    fn test_file_ref_message_creation() {
        let msg = FileRefMessage::new("src/main.rs");
        assert_eq!(msg.path, "src/main.rs");
        assert!(msg.line_range.is_none());

        let msg_with_range = FileRefMessage::with_range("src/main.rs", 10, 20);
        assert_eq!(msg_with_range.line_range, Some((10, 20)));
    }

    #[test]
    fn test_message_type_serialization() {
        let text_msg = RichMessageType::Text(TextMessage::new("Test"));
        let serialized = serde_json::to_string(&text_msg).unwrap();
        let deserialized: RichMessageType = serde_json::from_str(&serialized).unwrap();
        assert_eq!(text_msg, deserialized);
    }

    #[test]
    fn test_tool_request_default_status() {
        let status = ApprovalStatus::default();
        assert_eq!(status, ApprovalStatus::Pending);
    }

    #[test]
    fn test_image_recognition_mode_default() {
        let mode = ImageRecognitionMode::default();
        assert_eq!(mode, ImageRecognitionMode::Auto);
    }

    #[test]
    fn test_project_structure_message_creation() {
        let msg = ProjectStructMsg {
            root_path: PathBuf::from("/workspace/project"),
            structure_type: StructureType::Tree,
            content: ProjectStructureContent::FileList(vec![]),
            generated_at: Utc::now(),
            excluded_patterns: vec!["node_modules".to_string(), ".git".to_string()],
        };

        assert_eq!(msg.root_path, PathBuf::from("/workspace/project"));
        assert_eq!(msg.excluded_patterns.len(), 2);
    }

    #[test]
    fn test_mcp_tool_request_message() {
        let msg = MCPToolRequestMsg {
            server_name: "test-server".to_string(),
            tool_name: "search".to_string(),
            arguments: HashMap::new(),
            request_id: "req-123".to_string(),
            approval_status: ApprovalStatus::Pending,
            requested_at: Utc::now(),
            approved_at: None,
        };

        assert_eq!(msg.server_name, "test-server");
        assert_eq!(msg.tool_name, "search");
    }

    #[test]
    fn test_workflow_execution_message() {
        let msg = WorkflowExecMsg {
            workflow_name: "deploy".to_string(),
            execution_id: "exec-456".to_string(),
            status: WorkflowStatus::Running,
            current_step: Some("build".to_string()),
            total_steps: 5,
            completed_steps: 2,
            started_at: Utc::now(),
            updated_at: Utc::now(),
            result: None,
            error: None,
        };

        assert_eq!(msg.workflow_name, "deploy");
        assert_eq!(msg.status, WorkflowStatus::Running);
        assert_eq!(msg.completed_steps, 2);
    }

    #[test]
    fn test_all_new_message_types_serialization() {
        // Test ProjectStructure
        let project_msg = RichMessageType::ProjectStructure(ProjectStructMsg {
            root_path: PathBuf::from("/workspace"),
            structure_type: StructureType::Tree,
            content: ProjectStructureContent::FileList(vec![]),
            generated_at: Utc::now(),
            excluded_patterns: vec![],
        });
        let serialized = serde_json::to_string(&project_msg).unwrap();
        let _: RichMessageType = serde_json::from_str(&serialized).unwrap();

        // Test MCPToolRequest
        let mcp_request_msg = RichMessageType::MCPToolRequest(MCPToolRequestMsg {
            server_name: "server".to_string(),
            tool_name: "tool".to_string(),
            arguments: HashMap::new(),
            request_id: "req".to_string(),
            approval_status: ApprovalStatus::Pending,
            requested_at: Utc::now(),
            approved_at: None,
        });
        let serialized = serde_json::to_string(&mcp_request_msg).unwrap();
        let _: RichMessageType = serde_json::from_str(&serialized).unwrap();

        // Test WorkflowExecution
        let workflow_msg = RichMessageType::WorkflowExecution(WorkflowExecMsg {
            workflow_name: "test".to_string(),
            execution_id: "exec".to_string(),
            status: WorkflowStatus::Running,
            current_step: None,
            total_steps: 3,
            completed_steps: 0,
            started_at: Utc::now(),
            updated_at: Utc::now(),
            result: None,
            error: None,
        });
        let serialized = serde_json::to_string(&workflow_msg).unwrap();
        let _: RichMessageType = serde_json::from_str(&serialized).unwrap();
    }
}
