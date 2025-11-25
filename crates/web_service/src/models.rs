use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tool_system::types::DisplayPreference;
use uuid::Uuid;

#[derive(Debug, Deserialize, Clone)]
pub struct SendMessageRequestBody {
    pub payload: MessagePayload,
    #[serde(default)]
    pub client_metadata: ClientMessageMetadata,
}

#[derive(Debug, Clone)]
pub struct SendMessageRequest {
    pub session_id: Uuid,
    pub payload: MessagePayload,
    pub client_metadata: ClientMessageMetadata,
}

impl SendMessageRequest {
    pub fn from_parts(session_id: Uuid, body: SendMessageRequestBody) -> Self {
        Self {
            session_id,
            payload: body.payload,
            client_metadata: body.client_metadata,
        }
    }
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct ClientMessageMetadata {
    pub display_text: Option<String>,
    pub trace_id: Option<String>,
    #[serde(default)]
    pub extra: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum MessagePayload {
    Text {
        content: String,
        #[serde(default)]
        display: Option<String>,
    },
    FileReference {
        paths: Vec<String>, // ✅ Changed to Vec<String> to support multiple files/folders
        #[serde(default)]
        display_text: Option<String>,
    },
    Workflow {
        workflow: String,
        #[serde(default)]
        parameters: HashMap<String, serde_json::Value>,
        #[serde(default)]
        display_text: Option<String>,
    },
    ToolResult {
        tool_name: String,
        result: serde_json::Value,
        #[serde(default)]
        display_text: Option<String>,
    },
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct FileRange {
    pub start_line: Option<usize>,
    pub end_line: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSessionRequest {
    pub model_id: String,
    pub mode: String,
}

#[derive(Serialize, Debug)]
pub struct ParameterInfo {
    pub name: String,
    pub description: String,
    pub required: bool,
    #[serde(rename = "type")]
    pub param_type: String,
}

#[derive(Serialize, Debug)]
pub struct ToolUIInfo {
    pub name: String,
    pub description: String,
    pub parameters: Vec<ParameterInfo>,
    pub tool_type: String,
    pub parameter_parsing_strategy: String,
    pub parameter_regex: Option<String>,
    pub ai_prompt_template: Option<String>,
    pub hide_in_selector: bool,
    pub display_preference: DisplayPreference,
    pub required_approval: bool,
}

#[derive(Serialize, Debug)]
pub struct ToolsUIResponse {
    pub tools: Vec<ToolUIInfo>,
    pub is_strict_mode: bool,
}

#[derive(serde::Deserialize, Debug)]
pub struct ParameterValue {
    pub name: String,
    pub value: String,
}

#[derive(serde::Deserialize)]
pub struct ToolExecutionRequest {
    pub tool_name: String,
    pub parameters: Vec<ParameterValue>,
}

#[derive(Serialize)]
pub struct ToolExecutionResult {
    pub result: String,
    pub display_preference: DisplayPreference,
}

#[derive(Debug, Serialize)]
pub struct FinalizedMessage {
    pub message_id: Uuid,
    pub sequence: u64,
    pub summary: String,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", content = "data", rename_all = "snake_case")]
pub enum ServiceResponse {
    FinalMessage(String),
    AwaitingToolApproval(Vec<String>),
    AwaitingAgentApproval {
        reason: String,
        context_id: Uuid,
        request_id: Uuid,
    },
}
