//! Streaming response handling for LLM responses

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

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
