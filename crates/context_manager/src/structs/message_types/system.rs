//! System control and processing message types

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// System control message
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SystemMessage {
    /// Control type
    pub control_type: ControlType,

    /// Control parameters
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub parameters: HashMap<String, serde_json::Value>,
}

/// System control types
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

/// Processing status message
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

/// Processing stages
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
