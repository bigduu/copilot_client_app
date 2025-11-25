//! Streaming response handling for ChatContext
//!
//! This module handles streaming LLM responses with rich chunk tracking:
//! - Starting streaming responses
//! - Appending chunks
//! - Finalizing with statistics
//! - Incremental pull for chunks
//! - Message snapshots and sequences

use crate::structs::context::ChatContext;
use crate::structs::events::{ContextUpdate, MessageUpdate};
use crate::structs::message::{
    ContentPart, InternalMessage, MessageContentSlice, MessageTextSnapshot, MessageType, Role,
};
use crate::structs::message_types::{RichMessageType, StreamingResponseMsg};
use crate::structs::metadata::{MessageMetadata, MessageSource, StreamingMetadata};
use crate::structs::state::ContextState;
use chrono::Utc;
use std::collections::HashMap;
use uuid::Uuid;

impl ChatContext {
    // ============================================================================
    // Sequence Management
    // ============================================================================

    pub fn ensure_sequence_at_least(&mut self, message_id: Uuid, minimum: u64) -> u64 {
        let seq_entry = self.stream_sequences.entry(message_id).or_insert(0);
        if *seq_entry < minimum {
            *seq_entry = minimum;
        }
        *seq_entry
    }

    pub fn message_sequence(&self, message_id: Uuid) -> Option<u64> {
        self.stream_sequences.get(&message_id).copied()
    }

    pub fn message_text_snapshot(&self, message_id: Uuid) -> Option<MessageTextSnapshot> {
        let node = self.message_pool.get(&message_id)?;
        let content = node
            .message
            .content
            .iter()
            .filter_map(|part| part.text_content())
            .collect::<Vec<_>>()
            .join("");
        let sequence = self.stream_sequences.get(&message_id).copied().unwrap_or(0);

        Some(MessageTextSnapshot {
            message_id,
            content,
            sequence,
        })
    }

    pub fn message_content_slice(
        &self,
        message_id: Uuid,
        from_sequence: Option<u64>,
    ) -> Option<MessageContentSlice> {
        let snapshot = self.message_text_snapshot(message_id)?;
        let from_seq = from_sequence.unwrap_or(0);
        let has_updates = snapshot.sequence > from_seq;
        let content = if has_updates {
            snapshot.content
        } else {
            String::new()
        };

        Some(MessageContentSlice {
            context_id: self.id,
            message_id,
            sequence: snapshot.sequence,
            content,
            has_updates,
        })
    }

    // ============================================================================
    // Streaming Response Lifecycle
    // ============================================================================

    /// Begin a new streaming LLM response with rich chunk tracking (Phase 1.5.3)
    ///
    /// Returns the message ID of the newly created streaming response message.
    pub fn begin_streaming_llm_response(&mut self, model: Option<String>) -> Uuid {
        tracing::debug!(
            context_id = %self.id,
            model = ?model,
            "ChatContext: begin_streaming_llm_response - creating StreamingResponse message"
        );

        // Transition state
        let previous_state = self.current_state.clone();
        self.current_state = ContextState::StreamingLLMResponse;

        // Create a new StreamingResponseMsg
        let streaming_msg = StreamingResponseMsg::new(model);

        // Create internal message with rich type
        let mut metadata = MessageMetadata::default();
        metadata.source = Some(MessageSource::AIGenerated);
        metadata.created_at = Some(Utc::now());

        let assistant_message = InternalMessage {
            role: Role::Assistant,
            content: vec![], // Will be populated from streaming_msg.content
            message_type: MessageType::Text,
            rich_type: Some(RichMessageType::StreamingResponse(streaming_msg)),
            metadata: Some(metadata),
            ..Default::default()
        };

        // Add to active branch
        let branch_name = self.active_branch_name.clone();
        let message_id = self.add_message_to_branch(&branch_name, assistant_message);

        self.mark_dirty();

        tracing::info!(
            context_id = %self.id,
            message_id = %message_id,
            previous_state = ?previous_state,
            current_state = ?self.current_state,
            "ChatContext: streaming response started"
        );

        message_id
    }

    /// Append a chunk to an ongoing streaming response (Phase 1.5.3)
    ///
    /// Returns the sequence number of the appended chunk, or None if the message
    /// is not a StreamingResponse.
    pub fn append_streaming_chunk<S>(&mut self, message_id: Uuid, delta: S) -> Option<u64>
    where
        S: Into<String>,
    {
        let delta = delta.into();
        if delta.is_empty() {
            return None;
        }

        tracing::trace!(
            context_id = %self.id,
            message_id = %message_id,
            delta_len = delta.len(),
            "ChatContext: append_streaming_chunk"
        );

        let node = self.message_pool.get_mut(&message_id)?;

        // Extract StreamingResponseMsg from rich_type
        if let Some(RichMessageType::StreamingResponse(streaming_msg)) = &mut node.message.rich_type
        {
            let sequence = streaming_msg.append_chunk(delta.clone());
            let accumulated_chars = streaming_msg.content.len();
            let total_chunks = streaming_msg.chunks.len();

            // Also update the legacy content field for backward compatibility
            node.message.content = vec![ContentPart::text(&streaming_msg.content)];

            // Update stream_sequences to match chunks count for compatibility with message_sequence()
            self.stream_sequences.insert(message_id, sequence);

            // Drop the mutable borrow before calling mark_dirty
            let _ = node;
            self.mark_dirty();

            tracing::debug!(
                context_id = %self.id,
                message_id = %message_id,
                sequence = sequence,
                accumulated_chars = accumulated_chars,
                total_chunks = total_chunks,
                "ChatContext: chunk appended"
            );

            Some(sequence)
        } else {
            tracing::warn!(
                context_id = %self.id,
                message_id = %message_id,
                "ChatContext: append_streaming_chunk called on non-StreamingResponse message"
            );
            None
        }
    }

    /// Finalize a streaming response and calculate statistics (Phase 1.5.3)
    ///
    /// Returns true if the message was successfully finalized.
    pub fn finalize_streaming_response(
        &mut self,
        message_id: Uuid,
        finish_reason: Option<String>,
        usage: Option<crate::structs::metadata::TokenUsage>,
    ) -> bool {
        tracing::debug!(
            context_id = %self.id,
            message_id = %message_id,
            finish_reason = ?finish_reason,
            "ChatContext: finalize_streaming_response"
        );

        let node = self.message_pool.get_mut(&message_id);
        if node.is_none() {
            tracing::warn!(
                context_id = %self.id,
                message_id = %message_id,
                "ChatContext: finalize_streaming_response - message not found"
            );
            return false;
        }

        let node = node.unwrap();

        // Finalize StreamingResponseMsg
        if let Some(RichMessageType::StreamingResponse(streaming_msg)) = &mut node.message.rich_type
        {
            streaming_msg.finalize(finish_reason, usage.clone());

            // Update metadata with streaming statistics
            let mut metadata = node.message.metadata.clone().unwrap_or_default();

            // Calculate average chunk interval
            let intervals: Vec<u64> = streaming_msg
                .chunks
                .iter()
                .filter_map(|c| c.interval_ms)
                .collect();
            let avg_interval = if !intervals.is_empty() {
                Some(intervals.iter().sum::<u64>() as f64 / intervals.len() as f64)
            } else {
                None
            };

            metadata.streaming = Some(StreamingMetadata {
                chunks_count: streaming_msg.chunks.len(),
                started_at: streaming_msg.started_at,
                completed_at: streaming_msg.completed_at,
                total_duration_ms: streaming_msg.total_duration_ms,
                average_chunk_interval_ms: avg_interval,
            });
            metadata.tokens = usage;
            node.message.metadata = Some(metadata);

            // Extract values for logging before dropping node
            let total_chunks = streaming_msg.chunks.len();
            let total_duration_ms = streaming_msg.total_duration_ms;
            let content_length = streaming_msg.content.len();

            // Transition state back to processing
            let previous_state = self.current_state.clone();
            self.current_state = ContextState::ProcessingLLMResponse;

            // Drop the mutable borrow before calling mark_dirty
            let _ = node;
            self.mark_dirty();

            tracing::info!(
                context_id = %self.id,
                message_id = %message_id,
                total_chunks = total_chunks,
                total_duration_ms = ?total_duration_ms,
                content_length = content_length,
                previous_state = ?previous_state,
                current_state = ?self.current_state,
                "ChatContext: streaming response finalized"
            );

            true
        } else {
            tracing::warn!(
                context_id = %self.id,
                message_id = %message_id,
                "ChatContext: finalize_streaming_response called on non-StreamingResponse message"
            );
            false
        }
    }

    /// Abort streaming response on error
    pub fn abort_streaming_response<S>(&mut self, message_id: Uuid, error: S) -> Vec<ContextUpdate>
    where
        S: Into<String>,
    {
        let error_message = error.into();
        let mut updates = Vec::new();

        let previous_state = self.current_state.clone();
        self.current_state = ContextState::Failed {
            error_message: error_message.clone(),
            failed_at: chrono::Utc::now().to_rfc3339(),
        };

        let mut metadata = HashMap::new();
        metadata.insert(
            "error".to_string(),
            serde_json::Value::String(error_message.clone()),
        );

        updates.push(ContextUpdate {
            context_id: self.id,
            current_state: self.current_state.clone(),
            previous_state: Some(previous_state),
            message_update: Some(MessageUpdate::StatusChanged {
                message_id,
                old_status: "streaming".to_string(),
                new_status: "failed".to_string(),
            }),
            timestamp: Utc::now(),
            metadata,
        });

        updates
    }

    /// Get the current sequence number of a streaming response (Phase 1.5.3)
    pub fn get_streaming_sequence(&self, message_id: Uuid) -> Option<u64> {
        let node = self.message_pool.get(&message_id)?;

        if let Some(RichMessageType::StreamingResponse(streaming_msg)) = &node.message.rich_type {
            Some(streaming_msg.current_sequence())
        } else {
            None
        }
    }

    /// Get chunks after a given sequence for incremental pull (Phase 1.5.3)
    pub fn get_streaming_chunks_after(
        &self,
        message_id: Uuid,
        after_sequence: u64,
    ) -> Option<Vec<(u64, String)>> {
        let node = self.message_pool.get(&message_id)?;

        if let Some(RichMessageType::StreamingResponse(streaming_msg)) = &node.message.rich_type {
            let chunks = streaming_msg
                .chunks_after(after_sequence)
                .iter()
                .map(|chunk| (chunk.sequence, chunk.delta.clone()))
                .collect();
            Some(chunks)
        } else {
            None
        }
    }
}
