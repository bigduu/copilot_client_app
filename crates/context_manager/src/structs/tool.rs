use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tool_system::types::ToolArguments;

/// A request from the Assistant to call a single tool.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ToolCallRequest {
    pub id: String, // Unique ID for this specific call
    pub tool_name: String,
    pub arguments: ToolArguments,
    pub approval_status: ApprovalStatus,

    /// How the tool result should be displayed in the UI
    #[serde(default = "DisplayPreference::default")]
    pub display_preference: DisplayPreference,

    /// Additional UI rendering hints for the frontend
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ui_hints: Option<HashMap<String, serde_json::Value>>,
}

/// The result of a single tool call execution.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ToolCallResult {
    pub request_id: String, // Corresponds to ToolCallRequest.id
    pub result: serde_json::Value,
}

/// The lifecycle status of a tool call request.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum ApprovalStatus {
    Pending,
    Approved,
    Denied,
}

/// Defines how tool results should be displayed in the UI
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum DisplayPreference {
    /// Default display - show the result normally
    Default,
    /// Show the result in a collapsible component
    Collapsible,
    /// Hide the result from the UI
    Hidden,
}

impl Default for DisplayPreference {
    fn default() -> Self {
        DisplayPreference::Default
    }
}
