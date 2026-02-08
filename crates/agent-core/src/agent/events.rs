use crate::tools::ToolResult;
use crate::todo::TodoList;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AgentEvent {
    Token {
        content: String,
    },

    ToolStart {
        tool_call_id: String,
        tool_name: String,
        arguments: serde_json::Value,
    },

    ToolComplete {
        tool_call_id: String,
        result: ToolResult,
    },

    ToolError {
        tool_call_id: String,
        error: String,
    },

    NeedClarification {
        question: String,
        options: Option<Vec<String>>,
    },

    /// Emitted when todo list is created or updated
    TodoListUpdated {
        todo_list: TodoList,
    },

    Complete {
        usage: TokenUsage,
    },

    Error {
        message: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}
