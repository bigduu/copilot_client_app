//! Auto-loop management for ChatContext
//!
//! This module handles automatic tool execution loops, including:
//! - Starting and stopping loops
//! - Progress tracking
//! - Timeout and policy enforcement

use crate::fsm::ChatEvent;
use crate::structs::context::ChatContext;
use crate::structs::events::ContextUpdate;
use chrono::Utc;
use serde_json::json;
use std::collections::HashMap;

impl ChatContext {
    /// Start an auto-loop with depth tracking
    pub fn begin_auto_loop(&mut self, depth: u32) -> ContextUpdate {
        self.tool_execution.begin_auto_loop(depth);
        let previous_state = Some(self.current_state.clone());
        self.handle_event(ChatEvent::ToolAutoLoopStarted {
            depth,
            tools_executed: self.tool_execution.tools_executed(),
        });

        let mut metadata = HashMap::new();
        metadata.insert("tool_event".to_string(), json!("auto_loop_started"));
        metadata.insert("depth".to_string(), json!(depth));

        ContextUpdate {
            context_id: self.id,
            current_state: self.current_state.clone(),
            previous_state,
            message_update: None,
            timestamp: Utc::now(),
            metadata,
        }
    }

    /// Record loop iteration progress
    pub fn record_auto_loop_progress(&mut self) -> ContextUpdate {
        self.tool_execution.increment_tools_executed();
        let depth = self.tool_execution.auto_loop_depth();
        let executed = self.tool_execution.tools_executed();
        let previous_state = Some(self.current_state.clone());
        self.handle_event(ChatEvent::ToolAutoLoopProgress {
            depth,
            tools_executed: executed,
        });

        let mut metadata = HashMap::new();
        metadata.insert("tool_event".to_string(), json!("auto_loop_progress"));
        metadata.insert("depth".to_string(), json!(depth));
        metadata.insert("tools_executed".to_string(), json!(executed));

        ContextUpdate {
            context_id: self.id,
            current_state: self.current_state.clone(),
            previous_state,
            message_update: None,
            timestamp: Utc::now(),
            metadata,
        }
    }

    /// Complete auto-loop successfully
    pub fn complete_auto_loop(&mut self) -> ContextUpdate {
        let previous_state = Some(self.current_state.clone());
        self.handle_event(ChatEvent::ToolAutoLoopFinished);

        let mut metadata = HashMap::new();
        metadata.insert("tool_event".to_string(), json!("auto_loop_finished"));
        metadata.insert(
            "tools_executed".to_string(),
            json!(self.tool_execution.tools_executed()),
        );

        ContextUpdate {
            context_id: self.id,
            current_state: self.current_state.clone(),
            previous_state,
            message_update: None,
            timestamp: Utc::now(),
            metadata,
        }
    }

    /// Check if auto-loop should continue
    pub fn should_continue_auto_loop(&self) -> bool {
        // Check if loop has timed out
        if self.tool_execution.is_loop_timed_out() {
            tracing::warn!(
                context_id = %self.id,
                "Auto-loop timed out"
            );
            return false;
        }

        // Check if current execution has timed out
        if self.tool_execution.is_current_execution_timed_out() {
            tracing::warn!(
                context_id = %self.id,
                "Current tool execution timed out"
            );
            return false;
        }

        // Check policy limits
        if !self.tool_execution.can_continue() {
            tracing::info!(
                context_id = %self.id,
                depth = self.tool_execution.auto_loop_depth(),
                tools_executed = self.tool_execution.tools_executed(),
                "Auto-loop reached policy limits"
            );
            return false;
        }

        true
    }

    /// Cancel the current auto-loop
    pub fn cancel_auto_loop(&mut self, reason: &str) -> ContextUpdate {
        let previous_state = Some(self.current_state.clone());
        self.handle_event(ChatEvent::ToolAutoLoopCancelled);

        let mut metadata = HashMap::new();
        metadata.insert("tool_event".to_string(), json!("auto_loop_cancelled"));
        metadata.insert("reason".to_string(), json!(reason));
        metadata.insert(
            "tools_executed".to_string(),
            json!(self.tool_execution.tools_executed()),
        );
        metadata.insert(
            "depth_reached".to_string(),
            json!(self.tool_execution.auto_loop_depth()),
        );

        // Reset tool execution context
        self.tool_execution.complete_execution();

        ContextUpdate {
            context_id: self.id,
            current_state: self.current_state.clone(),
            previous_state,
            message_update: None,
            timestamp: Utc::now(),
            metadata,
        }
    }
}
