use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct TokenUsage {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completion_tokens: Option<u32>,
}

/// The source/origin of a message
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MessageSource {
    /// User typed text input
    UserInput,
    /// User provided file reference
    UserFileReference,
    /// User triggered workflow execution
    UserWorkflow,
    /// User uploaded image
    UserImageUpload,
    /// AI-generated response
    AIGenerated,
    /// Tool execution result
    ToolExecution,
    /// System control message
    SystemControl,
}

/// Display hints for frontend rendering
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct DisplayHint {
    /// Optional summary text for collapsed view
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    /// Whether content should be collapsed by default
    #[serde(default)]
    pub collapsed: bool,
    /// Optional icon identifier
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

/// Metadata about streaming response process
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct StreamingMetadata {
    /// Number of chunks received
    pub chunks_count: usize,
    /// When streaming started
    pub started_at: DateTime<Utc>,
    /// When streaming completed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<DateTime<Utc>>,
    /// Total duration in milliseconds
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_duration_ms: Option<u64>,
    /// Average interval between chunks in milliseconds
    #[serde(skip_serializing_if = "Option::is_none")]
    pub average_chunk_interval_ms: Option<f64>,
}

impl StreamingMetadata {
    pub fn new() -> Self {
        Self {
            chunks_count: 0,
            started_at: Utc::now(),
            completed_at: None,
            total_duration_ms: None,
            average_chunk_interval_ms: None,
        }
    }

    pub fn finalize(&mut self) {
        let now = Utc::now();
        self.completed_at = Some(now);
        let started_ms = self.started_at.timestamp_millis();
        let completed_ms = now.timestamp_millis();
        if started_ms <= completed_ms {
            let duration = (completed_ms - started_ms) as u64;
            self.total_duration_ms = Some(duration);
            if self.chunks_count > 1 {
                self.average_chunk_interval_ms =
                    Some(duration as f64 / (self.chunks_count - 1) as f64);
            }
        }
    }
}

impl Default for StreamingMetadata {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct MessageMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens: Option<TokenUsage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra: Option<HashMap<String, serde_json::Value>>,
    /// Source/origin of this message
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<MessageSource>,
    /// Display hints for frontend
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_hint: Option<DisplayHint>,
    /// Streaming metadata (if this was a streaming response)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub streaming: Option<StreamingMetadata>,
    /// Original user input (before any processing)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_input: Option<String>,
    /// Trace ID for distributed tracing
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trace_id: Option<String>,
}
