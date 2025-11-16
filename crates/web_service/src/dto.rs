//! DTO adapter layer for converting Context Manager structures to frontend-friendly formats
use serde::{Deserialize, Serialize};

/// DTO representing a chat context for the frontend
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ChatContextDTO {
    pub id: String,
    pub config: ChatConfigDTO,
    pub current_state: String,
    pub active_branch_name: String,
    pub message_count: usize,
    pub branches: Vec<BranchDTO>,
    /// Optional title for this context. If None, frontend should display a default title.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Whether to automatically generate a title after the first AI response.
    pub auto_generate_title: bool,
}

/// DTO representing chat configuration
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ChatConfigDTO {
    pub model_id: String,
    pub mode: String,
    pub parameters: serde_json::Value,
    pub system_prompt_id: Option<String>,
    pub agent_role: String, // "planner" or "actor"
    pub workspace_path: Option<String>,
    pub mermaid_diagrams: bool,
}

/// DTO representing a branch
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct BranchDTO {
    pub name: String,
    pub system_prompt: Option<SystemPromptDTO>,
    pub user_prompt: Option<String>,
    pub message_count: usize,
}

/// DTO representing a system prompt
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SystemPromptDTO {
    pub id: String,
    pub content: String,
}

/// DTO representing a template variable
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TemplateVariableDTO {
    pub key: String,
    pub value: String,
    pub description: Option<String>,
}

/// DTO representing a message
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MessageDTO {
    pub id: String,
    pub role: String,
    pub content: Vec<ContentPartDTO>,
    pub tool_calls: Option<Vec<ToolCallRequestDTO>>,
    pub tool_result: Option<ToolCallResultDTO>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_type: Option<String>, // "text", "plan", "question", "tool_call", "tool_result"
}

/// DTO representing content parts
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentPartDTO {
    Text { text: String },
    Image { url: String, detail: Option<String> },
}

/// DTO representing a tool call request
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ToolCallRequestDTO {
    pub id: String,
    pub tool_name: String,
    pub arguments: serde_json::Value,
    pub approval_status: String,
    pub display_preference: String,
    pub ui_hints: Option<serde_json::Value>,
}

/// DTO representing a tool call result
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ToolCallResultDTO {
    pub request_id: String,
    pub result: serde_json::Value,

    /// How the tool result should be displayed in the UI
    #[serde(default)]
    pub display_preference: Option<String>, // Option to maintain backward compatibility
}

/// Adapter functions to convert Context Manager types to DTOs
impl From<context_manager::structs::context::ChatContext> for ChatContextDTO {
    fn from(context: context_manager::structs::context::ChatContext) -> Self {
        let branches: Vec<BranchDTO> = context
            .branches
            .values()
            .map(|branch| branch.clone().into())
            .collect();

        ChatContextDTO {
            id: context.id.to_string(),
            config: context.config.into(),
            current_state: format!("{:?}", context.current_state),
            active_branch_name: context.active_branch_name,
            message_count: context.message_pool.len(),
            branches,
            title: context.title,
            auto_generate_title: context.auto_generate_title,
        }
    }
}

impl From<context_manager::structs::context::ChatConfig> for ChatConfigDTO {
    fn from(config: context_manager::structs::context::ChatConfig) -> Self {
        ChatConfigDTO {
            model_id: config.model_id,
            mode: config.mode,
            parameters: serde_json::to_value(config.parameters).unwrap_or_default(),
            system_prompt_id: config.system_prompt_id,
            agent_role: format!("{:?}", config.agent_role).to_lowercase(),
            workspace_path: config.workspace_path,
            mermaid_diagrams: config.mermaid_diagrams,
        }
    }
}

impl From<context_manager::structs::branch::Branch> for BranchDTO {
    fn from(branch: context_manager::structs::branch::Branch) -> Self {
        BranchDTO {
            name: branch.name,
            system_prompt: branch.system_prompt.map(|sp| sp.into()),
            user_prompt: branch.user_prompt,
            message_count: branch.message_ids.len(),
        }
    }
}

impl From<context_manager::structs::branch::SystemPrompt> for SystemPromptDTO {
    fn from(sp: context_manager::structs::branch::SystemPrompt) -> Self {
        SystemPromptDTO {
            id: sp.id,
            content: sp.content,
        }
    }
}

impl From<context_manager::structs::message::MessageNode> for MessageDTO {
    fn from(node: context_manager::structs::message::MessageNode) -> Self {
        let mut content = Vec::new();
        for part in node.message.content {
            match part {
                context_manager::structs::message::ContentPart::Text { text } => {
                    content.push(ContentPartDTO::Text { text });
                }
                context_manager::structs::message::ContentPart::Image { url, detail } => {
                    content.push(ContentPartDTO::Image { url, detail });
                }
            }
        }

        MessageDTO {
            id: node.id.to_string(),
            role: node.message.role.to_string(), // Use Display trait for lowercase
            content,
            tool_calls: node
                .message
                .tool_calls
                .map(|calls| calls.into_iter().map(|call| call.into()).collect()),
            tool_result: node.message.tool_result.map(|result| result.into()),
            message_type: {
                let msg_type = &node.message.message_type;
                // Convert MessageType enum to snake_case string
                match msg_type {
                    context_manager::structs::message::MessageType::Text => {
                        Some("text".to_string())
                    }
                    context_manager::structs::message::MessageType::Plan => {
                        Some("plan".to_string())
                    }
                    context_manager::structs::message::MessageType::Question => {
                        Some("question".to_string())
                    }
                    context_manager::structs::message::MessageType::ToolCall => {
                        Some("tool_call".to_string())
                    }
                    context_manager::structs::message::MessageType::ToolResult => {
                        Some("tool_result".to_string())
                    }
                }
            },
        }
    }
}

impl From<context_manager::structs::tool::ToolCallRequest> for ToolCallRequestDTO {
    fn from(call: context_manager::structs::tool::ToolCallRequest) -> Self {
        let arguments = match call.arguments {
            tool_system::types::ToolArguments::Json(json) => json,
            tool_system::types::ToolArguments::String(s) => serde_json::Value::String(s),
            tool_system::types::ToolArguments::StringList(v) => serde_json::Value::Array(
                v.into_iter()
                    .map(|s| serde_json::Value::String(s))
                    .collect(),
            ),
        };

        ToolCallRequestDTO {
            id: call.id,
            tool_name: call.tool_name,
            arguments,
            approval_status: format!("{:?}", call.approval_status),
            display_preference: format!("{:?}", call.display_preference),
            ui_hints: call
                .ui_hints
                .map(|hints| serde_json::to_value(hints).unwrap_or_default()),
        }
    }
}

impl From<context_manager::structs::tool::ToolCallResult> for ToolCallResultDTO {
    fn from(result: context_manager::structs::tool::ToolCallResult) -> Self {
        ToolCallResultDTO {
            request_id: result.request_id,
            result: result.result,
            display_preference: Some(format!("{:?}", result.display_preference)),
        }
    }
}

/// Helper to convert Vec<MessageNode> to Vec<MessageDTO>
pub fn messages_to_dtos(
    nodes: Vec<context_manager::structs::message::MessageNode>,
) -> Vec<MessageDTO> {
    nodes.into_iter().map(|node| node.into()).collect()
}

/// Helper to get messages for a branch
pub fn get_branch_messages(
    context: &context_manager::structs::context::ChatContext,
    branch_name: &str,
) -> Vec<MessageDTO> {
    if let Some(branch) = context.branches.get(branch_name) {
        let mut messages = Vec::new();
        for msg_id in &branch.message_ids {
            if let Some(node) = context.message_pool.get(msg_id) {
                messages.push(MessageDTO::from(node.clone()));
            }
        }
        messages
    } else {
        Vec::new()
    }
}
