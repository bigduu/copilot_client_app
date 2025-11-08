//! Processing Context
//!
//! This module defines the context that is passed through the pipeline.

use crate::structs::context::ChatContext;
use crate::structs::message::InternalMessage;
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;

/// Processing Context
///
/// This structure holds all the data that processors need to work with.
/// It is passed mutably through the pipeline, allowing each processor to:
/// - Read and modify the message
/// - Access and read ChatContext (for configuration, history, etc.)
/// - Add metadata
/// - Store intermediate results (file contents, tool definitions, etc.)
/// - Update statistics
pub struct ProcessingContext<'a> {
    /// The message being processed
    pub message: InternalMessage,

    /// Reference to the ChatContext
    ///
    /// Processors can read context configuration, check agent role, access workspace path, etc.
    /// Note: Direct message pool modification should be done after pipeline execution.
    pub chat_context: &'a mut ChatContext,

    /// Temporary metadata collected during processing
    ///
    /// Processors can store arbitrary data here for use by later processors.
    pub metadata: HashMap<String, Value>,

    /// File contents read during processing
    ///
    /// Populated by FileReferenceProcessor
    pub file_contents: Vec<FileContent>,

    /// Tool definitions available for this message
    ///
    /// Populated by ToolEnhancementProcessor
    pub available_tools: Vec<ToolDefinition>,

    /// System prompt fragments
    ///
    /// Collected from various processors and merged by SystemPromptProcessor
    pub prompt_fragments: Vec<PromptFragment>,

    /// Processing statistics
    pub stats: ProcessingStats,
}

impl<'a> ProcessingContext<'a> {
    /// Create a new processing context
    pub fn new(message: InternalMessage, chat_context: &'a mut ChatContext) -> Self {
        Self {
            message,
            chat_context,
            metadata: HashMap::new(),
            file_contents: Vec::new(),
            available_tools: Vec::new(),
            prompt_fragments: Vec::new(),
            stats: ProcessingStats::default(),
        }
    }

    /// Add metadata
    pub fn add_metadata(&mut self, key: impl Into<String>, value: Value) {
        self.metadata.insert(key.into(), value);
    }

    /// Get metadata
    pub fn get_metadata(&self, key: &str) -> Option<&Value> {
        self.metadata.get(key)
    }

    /// Add file content
    pub fn add_file_content(&mut self, content: FileContent) {
        self.file_contents.push(content);
        self.stats.files_read += 1;
    }

    /// Add tool definition
    pub fn add_tool(&mut self, tool: ToolDefinition) {
        self.available_tools.push(tool);
        self.stats.tools_injected += 1;
    }

    /// Add prompt fragment
    pub fn add_prompt_fragment(&mut self, fragment: PromptFragment) {
        self.prompt_fragments.push(fragment);
    }

    /// Get all prompt fragments sorted by priority
    pub fn get_sorted_prompt_fragments(&self) -> Vec<&PromptFragment> {
        let mut fragments: Vec<_> = self.prompt_fragments.iter().collect();
        fragments.sort_by_key(|f| std::cmp::Reverse(f.priority));
        fragments
    }
}

/// File Content
///
/// Represents a file that was read during processing.
#[derive(Debug, Clone)]
pub struct FileContent {
    /// File path
    pub path: PathBuf,
    /// File content
    pub content: String,
    /// Start line (if range was specified)
    pub start_line: Option<usize>,
    /// End line (if range was specified)
    pub end_line: Option<usize>,
    /// File size in bytes
    pub size_bytes: usize,
    /// MIME type (if detected)
    pub mime_type: Option<String>,
}

/// Tool Definition
///
/// Represents a tool that can be used by the LLM.
#[derive(Debug, Clone)]
pub struct ToolDefinition {
    /// Tool name
    pub name: String,
    /// Tool description
    pub description: String,
    /// Tool category (file_system, code_analysis, etc.)
    pub category: String,
    /// Parameters schema (JSON Schema)
    pub parameters_schema: Value,
    /// Whether this tool requires approval
    pub requires_approval: bool,
}

/// Prompt Fragment
///
/// A piece of text to be included in the system prompt.
#[derive(Debug, Clone)]
pub struct PromptFragment {
    /// Fragment content
    pub content: String,
    /// Fragment source (e.g., "tool_enhancement", "file_context")
    pub source: String,
    /// Priority (higher priority fragments appear first)
    pub priority: u8,
}

/// Processing Statistics
///
/// Tracks statistics during pipeline execution.
#[derive(Debug, Default, Clone)]
pub struct ProcessingStats {
    /// Number of processors executed
    pub processors_run: usize,
    /// Total processing time in milliseconds
    pub total_duration_ms: u64,
    /// Per-processor durations (processor_name, duration_ms)
    pub processor_durations: Vec<(String, u64)>,
    /// Number of files read
    pub files_read: usize,
    /// Number of tools injected
    pub tools_injected: usize,
    /// Number of prompt fragments added
    pub prompt_fragments_added: usize,
}

impl ProcessingStats {
    /// Record that a processor ran
    pub fn record_processor(&mut self, name: String, duration_ms: u64) {
        self.processors_run += 1;
        self.total_duration_ms += duration_ms;
        self.processor_durations.push((name, duration_ms));
    }
}

