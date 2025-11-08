//! Processing Results
//!
//! This module defines the result types returned by processors and the pipeline.

use crate::pipeline::context::ProcessingStats;
use crate::structs::message::InternalMessage;
use serde_json::Value;
use std::collections::HashMap;

/// Process Result
///
/// Returned by each processor to indicate what should happen next.
#[derive(Debug)]
pub enum ProcessResult {
    /// Continue to the next processor
    Continue,

    /// Transform the message and continue
    ///
    /// This allows processors to modify the message before passing it to the next processor.
    Transform(InternalMessage),

    /// Abort the pipeline
    ///
    /// This stops all further processing. Typically used when validation fails.
    Abort {
        /// Reason for aborting
        reason: String,
    },

    /// Suspend the pipeline
    ///
    /// This is used when asynchronous operations are needed (e.g., user approval).
    /// The pipeline can be resumed later using the resume_token.
    Suspend {
        /// Token to resume processing
        resume_token: String,
        /// Reason for suspension
        reason: String,
    },
}

/// Pipeline Output
///
/// The final result of executing the entire pipeline.
#[derive(Debug)]
pub enum PipelineOutput {
    /// Pipeline completed successfully
    Completed {
        /// The processed message
        message: InternalMessage,
        /// Metadata collected during processing
        metadata: HashMap<String, Value>,
        /// Statistics about the processing
        stats: ProcessingStats,
    },

    /// Pipeline was suspended (needs user action)
    Suspended {
        /// Token to resume processing
        resume_token: String,
        /// Reason for suspension
        reason: String,
        /// Partial state (for resumption)
        partial_state: Box<ProcessingState>,
    },

    /// Pipeline was aborted
    Aborted {
        /// Reason for abortion
        reason: String,
        /// Name of the processor that aborted
        aborted_by: String,
    },
}

/// Processing State
///
/// Represents the state of the pipeline at suspension point.
/// This allows resuming the pipeline from where it left off.
#[derive(Debug, Clone)]
pub struct ProcessingState {
    /// Index of the processor that suspended
    pub suspended_at: usize,
    /// The message being processed
    pub message: InternalMessage,
    /// Accumulated metadata
    pub metadata: HashMap<String, Value>,
    /// Statistics so far
    pub stats: ProcessingStats,
}

