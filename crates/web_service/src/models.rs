use serde::{Deserialize, Serialize};
use tool_system::types::DisplayPreference;

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
