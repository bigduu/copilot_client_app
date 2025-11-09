use crate::structs::branch::Branch;
use crate::structs::context_agent::AgentRole;
use crate::structs::message::MessageNode;
use crate::structs::state::ContextState;
use crate::structs::tool::{ToolApprovalPolicy, ToolExecutionContext};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

/// Represents a complete conversational session. Can be a top-level chat or a sub-context.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatContext {
    pub id: Uuid,
    pub parent_id: Option<Uuid>,
    pub config: ChatConfig,

    /// The single source of truth for all message data in this context.
    /// Provides O(1) lookup performance for any message by its ID.
    pub message_pool: HashMap<Uuid, MessageNode>,

    /// Manages all distinct lines of conversation within this context.
    pub branches: HashMap<String, Branch>,

    pub active_branch_name: String,

    /// The current state of the conversation lifecycle.
    #[serde(default)]
    pub current_state: ContextState,

    /// Runtime flag to track if context needs persistence (not serialized).
    /// Used to optimize auto-save by skipping redundant writes.
    #[serde(skip)]
    pub(crate) dirty: bool,

    /// Trace ID for distributed tracing (not persisted, set at runtime)
    #[serde(skip)]
    pub trace_id: Option<String>,

    /// Runtime data for tool approval and execution lifecycle.
    #[serde(skip)]
    pub tool_execution: ToolExecutionContext,

    /// Runtime sequence counters for streaming / 非流式 SSE 通知。
    #[serde(skip)]
    pub stream_sequences: HashMap<Uuid, u64>,
}

impl ChatContext {
    pub fn new(id: Uuid, model_id: String, mode: String) -> Self {
        tracing::debug!(
            context_id = %id,
            model_id = %model_id,
            mode = %mode,
            "ChatContext: Creating new context"
        );

        let mut branches = HashMap::new();
        let main_branch = Branch::new("main".to_string());
        branches.insert("main".to_string(), main_branch);

        Self {
            id,
            parent_id: None,
            config: ChatConfig {
                model_id,
                mode,
                parameters: HashMap::new(),
                system_prompt_id: None,
                agent_role: AgentRole::default(),
                workspace_path: None,
            },
            message_pool: HashMap::new(),
            branches,
            active_branch_name: "main".to_string(),
            current_state: ContextState::Idle,
            dirty: false,
            trace_id: None,
            tool_execution: ToolExecutionContext::default(),
            stream_sequences: HashMap::new(),
        }
    }
}

/// The configuration for a ChatContext.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatConfig {
    pub model_id: String,
    pub mode: String, // e.g., "planning", "coding", "tool-use"
    pub parameters: HashMap<String, serde_json::Value>, // e.g., temperature
    /// Optional system prompt ID to use for this context's branches
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub system_prompt_id: Option<String>,
    /// Agent role determines permissions and behavior
    #[serde(default)]
    pub agent_role: AgentRole,
    /// Workspace root path for file references
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_path: Option<String>,
}

impl ChatConfig {
    pub fn set_workspace_path(&mut self, path: Option<String>) {
        self.workspace_path = path;
    }

    pub fn workspace_path(&self) -> Option<&str> {
        self.workspace_path.as_deref()
    }
}

impl ChatContext {
    pub fn set_workspace_path(&mut self, path: Option<String>) {
        self.config.set_workspace_path(path);
        self.mark_dirty();
    }

    pub fn workspace_path(&self) -> Option<&str> {
        self.config.workspace_path()
    }

    // Tool approval policy configuration
    pub fn set_tool_approval_policy(&mut self, policy: ToolApprovalPolicy) {
        self.tool_execution.set_policy(policy);
    }

    pub fn tool_approval_policy(&self) -> &ToolApprovalPolicy {
        self.tool_execution.policy()
    }
    
    // Tool timeout configuration
    pub fn set_tool_timeout_config(&mut self, config: crate::ToolTimeoutConfig) {
        self.tool_execution.set_timeout_config(config);
    }
    
    pub fn tool_timeout_config(&self) -> &crate::ToolTimeoutConfig {
        self.tool_execution.timeout_config()
    }
    
    // Tool safety configuration
    pub fn set_tool_safety_config(&mut self, config: crate::ToolSafetyConfig) {
        self.tool_execution.set_safety_config(config);
    }
    
    pub fn tool_safety_config(&self) -> &crate::ToolSafetyConfig {
        self.tool_execution.safety_config()
    }
    
    // Tool execution context accessors
    pub fn tool_execution_context(&self) -> &crate::ToolExecutionContext {
        &self.tool_execution
    }
    
    pub fn tool_execution_context_mut(&mut self) -> &mut crate::ToolExecutionContext {
        &mut self.tool_execution
    }
}
