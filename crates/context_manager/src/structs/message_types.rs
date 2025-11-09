//! Rich internal message type system
//!
//! This module defines a comprehensive type system for internal messages.
//! Different from the simplified format sent to LLMs, these types capture
//! full processing details for debugging, auditing, and multi-LLM adaptation.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

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
// Text Message
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TextMessage {
    pub content: String,

    /// Optional display text (different from actual content sent to LLM)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_text: Option<String>,

    /// Text formatting hints
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub formatting: Option<TextFormatting>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TextFormatting {
    pub markdown: bool,
    pub code_block: Option<String>, // language hint
    pub highlighted_ranges: Vec<(usize, usize)>,
}

impl TextMessage {
    pub fn new<S: Into<String>>(content: S) -> Self {
        Self {
            content: content.into(),
            display_text: None,
            formatting: None,
        }
    }

    pub fn with_display<S: Into<String>>(content: S, display: S) -> Self {
        Self {
            content: content.into(),
            display_text: Some(display.into()),
            formatting: None,
        }
    }
}

// ============================================================================
// Streaming Response Message (Phase 1.5.2)
// ============================================================================

/// A single chunk in a streaming response
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StreamChunk {
    /// Sequence number of this chunk (1-based)
    pub sequence: u64,

    /// Delta content (incremental text)
    pub delta: String,

    /// When this chunk was received
    pub timestamp: DateTime<Utc>,

    /// Total accumulated characters up to and including this chunk
    pub accumulated_chars: usize,

    /// Time interval from previous chunk in milliseconds
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interval_ms: Option<u64>,
}

impl StreamChunk {
    pub fn new(sequence: u64, delta: String, accumulated_chars: usize) -> Self {
        Self {
            sequence,
            delta,
            timestamp: Utc::now(),
            accumulated_chars,
            interval_ms: None,
        }
    }
}

/// Streaming response message with full chunk tracking
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StreamingResponseMsg {
    /// Complete final content (accumulated from all chunks)
    pub content: String,

    /// All received chunks in order
    pub chunks: Vec<StreamChunk>,

    /// When streaming started
    pub started_at: DateTime<Utc>,

    /// When streaming completed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<DateTime<Utc>>,

    /// Total duration in milliseconds
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_duration_ms: Option<u64>,

    /// Model that generated this response
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,

    /// Token usage statistics
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<crate::structs::metadata::TokenUsage>,

    /// Reason for completion (stop, length, tool_calls, etc.)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finish_reason: Option<String>,
}

impl StreamingResponseMsg {
    /// Create a new streaming response
    pub fn new(model: Option<String>) -> Self {
        Self {
            content: String::new(),
            chunks: Vec::new(),
            started_at: Utc::now(),
            completed_at: None,
            total_duration_ms: None,
            model,
            usage: None,
            finish_reason: None,
        }
    }

    /// Append a new chunk and return its sequence number
    pub fn append_chunk(&mut self, delta: String) -> u64 {
        let sequence = self.chunks.len() as u64 + 1;
        let accumulated_chars = self.content.len() + delta.len();

        let mut chunk = StreamChunk::new(sequence, delta.clone(), accumulated_chars);

        // Calculate interval from last chunk
        if let Some(last_chunk) = self.chunks.last() {
            let interval =
                chunk.timestamp.timestamp_millis() - last_chunk.timestamp.timestamp_millis();
            if interval >= 0 {
                chunk.interval_ms = Some(interval as u64);
            }
        }

        self.chunks.push(chunk);
        self.content.push_str(&delta);

        sequence
    }

    /// Mark the streaming as complete and calculate final statistics
    pub fn finalize(
        &mut self,
        finish_reason: Option<String>,
        usage: Option<crate::structs::metadata::TokenUsage>,
    ) {
        let now = Utc::now();
        self.completed_at = Some(now);
        self.finish_reason = finish_reason;
        self.usage = usage;

        let duration_ms = now.timestamp_millis() - self.started_at.timestamp_millis();
        if duration_ms >= 0 {
            self.total_duration_ms = Some(duration_ms as u64);
        }
    }

    /// Get the current sequence number (number of chunks received)
    pub fn current_sequence(&self) -> u64 {
        self.chunks.len() as u64
    }

    /// Get chunks after a given sequence number
    ///
    /// Note: Sequence numbers are 1-based (first chunk has sequence=1)
    /// - `chunks_after(0)` returns all chunks
    /// - `chunks_after(1)` returns chunks from sequence 2 onwards
    /// - `chunks_after(n)` returns chunks from sequence n+1 onwards
    pub fn chunks_after(&self, sequence: u64) -> &[StreamChunk] {
        let start_index = sequence as usize;
        if start_index < self.chunks.len() {
            &self.chunks[start_index..]
        } else {
            &[]
        }
    }
}

// ============================================================================
// Image Message
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ImageMessage {
    /// Image data source
    pub image_data: ImageData,

    /// Recognition mode used or to be used
    pub recognition_mode: ImageRecognitionMode,

    /// OCR extracted text
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recognized_text: Option<String>,

    /// Vision model analysis result
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vision_analysis: Option<String>,

    /// Recognition error if any
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,

    /// Timestamp of recognition
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recognized_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ImageData {
    /// Remote image URL
    Url(String),

    /// Base64 encoded image
    Base64 { data: String, mime_type: String },

    /// Local file path
    FilePath(PathBuf),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ImageRecognitionMode {
    /// Use LLM vision capability (e.g., GPT-4V)
    Vision,

    /// Use OCR engine (e.g., Tesseract)
    OCR,

    /// Auto-select: prefer Vision, fallback to OCR
    #[default]
    Auto,
}

// ============================================================================
// File Reference Message
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FileRefMessage {
    /// File path (absolute or relative to workspace)
    pub path: String,

    /// Optional line range (1-indexed, inclusive)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line_range: Option<(usize, usize)>,

    /// Resolved file content
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolved_content: Option<String>,

    /// When the content was resolved
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolved_at: Option<DateTime<Utc>>,

    /// Resolution error if file couldn't be read
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolution_error: Option<String>,

    /// File metadata
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<FileMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FileMetadata {
    pub size_bytes: u64,
    pub mime_type: Option<String>,
    pub last_modified: Option<DateTime<Utc>>,
    pub line_count: Option<usize>,
}

impl FileRefMessage {
    pub fn new<S: Into<String>>(path: S) -> Self {
        Self {
            path: path.into(),
            line_range: None,
            resolved_content: None,
            resolved_at: None,
            resolution_error: None,
            metadata: None,
        }
    }

    pub fn with_range<S: Into<String>>(path: S, start: usize, end: usize) -> Self {
        Self {
            path: path.into(),
            line_range: Some((start, end)),
            resolved_content: None,
            resolved_at: None,
            resolution_error: None,
            metadata: None,
        }
    }
}

// ============================================================================
// Tool Request Message
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ToolRequestMessage {
    /// Tool calls requested by the LLM
    pub calls: Vec<ToolCall>,

    /// Approval status
    pub approval_status: ApprovalStatus,

    /// When the request was made
    pub requested_at: DateTime<Utc>,

    /// When approved (if approved)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approved_at: Option<DateTime<Utc>>,

    /// Who approved (future: user ID)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approved_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalStatus {
    #[default]
    Pending,
    Approved,
    Denied,
    AutoApproved,
}

// ============================================================================
// Tool Result Message
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ToolResultMessage {
    /// Corresponding tool call request ID
    pub request_id: String,

    /// Tool execution result
    pub result: serde_json::Value,

    /// Execution status
    pub status: ExecutionStatus,

    /// When executed
    pub executed_at: DateTime<Utc>,

    /// Execution duration in milliseconds
    pub duration_ms: u64,

    /// Error details if execution failed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ErrorDetail>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionStatus {
    Success,
    Failed,
    Timeout,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ErrorDetail {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

// ============================================================================
// MCP Resource Message
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MCPResourceMessage {
    /// MCP server name
    pub server_name: String,

    /// Resource URI
    pub resource_uri: String,

    /// Resource content
    pub content: String,

    /// Content MIME type
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,

    /// When retrieved
    pub retrieved_at: DateTime<Utc>,
}

// ============================================================================
// System Control Message
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SystemMessage {
    /// Control type
    pub control_type: ControlType,

    /// Control parameters
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub parameters: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ControlType {
    /// Mode switch (e.g., Plan -> Act)
    ModeSwitch,

    /// Context optimization trigger
    OptimizationTrigger,

    /// Branch operation
    BranchOperation,

    /// Compression request
    CompressionRequest,

    /// Custom control
    Custom(String),
}

// ============================================================================
// Processing Message
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProcessingMessage {
    /// Current processing stage
    pub stage: ProcessingStage,

    /// When processing started
    pub started_at: DateTime<Utc>,

    /// Additional metadata
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub metadata: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ProcessingStage {
    /// Resolving file references
    ResolvingFiles,

    /// Enhancing system prompt
    EnhancingPrompt,

    /// Optimizing context
    OptimizingContext,

    /// Preparing LLM request
    PreparingLLMRequest,

    /// Parsing LLM response
    ParsingLLMResponse,

    /// Executing tools
    ExecutingTools,

    /// Custom stage
    Custom(String),
}

// ============================================================================
// Project Structure Message (NEW)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProjectStructMsg {
    /// Root path of the project
    pub root_path: PathBuf,

    /// Type of structure representation
    pub structure_type: StructureType,

    /// The actual structure content
    pub content: ProjectStructureContent,

    /// When this structure was generated
    pub generated_at: DateTime<Utc>,

    /// Patterns to exclude (e.g., ".git", "node_modules")
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub excluded_patterns: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum StructureType {
    /// Tree representation (hierarchical)
    Tree,
    /// Flat file list
    FileList,
    /// Dependency graph
    Dependencies,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "format", content = "data", rename_all = "snake_case")]
pub enum ProjectStructureContent {
    Tree(DirectoryNode),
    FileList(Vec<FileInfo>),
    Dependencies(DependencyGraph),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DirectoryNode {
    pub name: String,
    pub path: PathBuf,
    pub children: Vec<DirectoryNode>,
    pub files: Vec<FileInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FileInfo {
    pub path: PathBuf,
    pub size_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DependencyGraph {
    pub dependencies: Vec<Dependency>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Dependency {
    pub name: String,
    pub version: String,
    pub dep_type: DependencyType,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DependencyType {
    Direct,
    Transitive,
    Dev,
    Build,
}

// ============================================================================
// MCP Tool Messages (NEW)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MCPToolRequestMsg {
    /// MCP server name
    pub server_name: String,

    /// Tool name within the MCP server
    pub tool_name: String,

    /// Tool arguments
    pub arguments: HashMap<String, serde_json::Value>,

    /// Request ID for correlation
    pub request_id: String,

    /// Approval status
    pub approval_status: ApprovalStatus,

    /// When requested
    pub requested_at: DateTime<Utc>,

    /// When approved (if approved)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approved_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MCPToolResultMsg {
    /// MCP server name
    pub server_name: String,

    /// Tool name
    pub tool_name: String,

    /// Corresponding request ID
    pub request_id: String,

    /// Execution result
    pub result: serde_json::Value,

    /// Execution status
    pub status: ExecutionStatus,

    /// When executed
    pub executed_at: DateTime<Utc>,

    /// Duration in milliseconds
    pub duration_ms: u64,

    /// Error details if failed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ErrorDetail>,
}

// ============================================================================
// Workflow Execution Message (NEW)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkflowExecMsg {
    /// Workflow name
    pub workflow_name: String,

    /// Unique execution ID
    pub execution_id: String,

    /// Current workflow status
    pub status: WorkflowStatus,

    /// Current step being executed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_step: Option<String>,

    /// Total number of steps
    pub total_steps: usize,

    /// Number of completed steps
    pub completed_steps: usize,

    /// When execution started
    pub started_at: DateTime<Utc>,

    /// Last update time
    pub updated_at: DateTime<Utc>,

    /// Final result (if completed)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,

    /// Error details (if failed)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ErrorDetail>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowStatus {
    Pending,
    Running,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

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
