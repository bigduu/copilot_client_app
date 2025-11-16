use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use tool_system::types::ToolArguments;
use uuid::Uuid;

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

    /// How the tool result should be displayed in the UI
    #[serde(default = "DisplayPreference::default")]
    pub display_preference: DisplayPreference,
}

/// The lifecycle status of a tool call request.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum ApprovalStatus {
    Pending,
    Approved,
    Denied,
}

/// Defines how tool results should be displayed in the UI
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub enum DisplayPreference {
    /// Default display - show the result normally
    #[default]
    Default,
    /// Show the result in a collapsible component
    Collapsible,
    /// Hide the result from the UI
    Hidden,
}

#[derive(Debug, Clone)]
pub struct PendingToolRequest {
    pub request_id: Uuid,
    pub tool_name: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct CurrentToolExecution {
    pub request_id: Option<Uuid>,
    pub tool_name: String,
    pub attempt: u8,
    pub started_at: DateTime<Utc>,
    pub timeout_ms: Option<u64>,
}

impl CurrentToolExecution {
    /// Check if the current execution has timed out
    pub fn is_timed_out(&self) -> bool {
        if let Some(timeout_ms) = self.timeout_ms {
            let elapsed = Utc::now()
                .signed_duration_since(self.started_at)
                .num_milliseconds();
            elapsed > timeout_ms as i64
        } else {
            false
        }
    }

    /// Get elapsed time in milliseconds
    pub fn elapsed_ms(&self) -> i64 {
        Utc::now()
            .signed_duration_since(self.started_at)
            .num_milliseconds()
    }
}

/// Configuration for tool execution timeouts
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolTimeoutConfig {
    /// Default timeout for tool execution in milliseconds
    pub default_timeout_ms: u64,

    /// Per-tool timeout overrides
    pub tool_timeouts: HashMap<String, u64>,

    /// Maximum timeout for auto-loop cycle in milliseconds
    pub max_loop_timeout_ms: u64,
}

impl Default for ToolTimeoutConfig {
    fn default() -> Self {
        Self {
            default_timeout_ms: 30_000, // 30 seconds
            tool_timeouts: HashMap::new(),
            max_loop_timeout_ms: 300_000, // 5 minutes
        }
    }
}

impl ToolTimeoutConfig {
    /// Get timeout for a specific tool
    pub fn get_timeout(&self, tool_name: &str) -> u64 {
        self.tool_timeouts
            .get(tool_name)
            .copied()
            .unwrap_or(self.default_timeout_ms)
    }
}

/// Safety configuration for dangerous operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolSafetyConfig {
    /// Tools that always require manual approval regardless of policy
    pub dangerous_tools: HashSet<String>,

    /// Operations that require approval (e.g., "delete", "write", "execute")
    pub dangerous_operations: HashSet<String>,
}

impl Default for ToolSafetyConfig {
    fn default() -> Self {
        let mut dangerous_tools = HashSet::new();
        dangerous_tools.insert("delete_file".to_string());
        dangerous_tools.insert("execute_command".to_string());
        dangerous_tools.insert("write_file".to_string());

        let mut dangerous_operations = HashSet::new();
        dangerous_operations.insert("delete".to_string());
        dangerous_operations.insert("write".to_string());
        dangerous_operations.insert("execute".to_string());
        dangerous_operations.insert("modify".to_string());

        Self {
            dangerous_tools,
            dangerous_operations,
        }
    }
}

impl ToolSafetyConfig {
    /// Check if a tool is considered dangerous
    pub fn is_dangerous_tool(&self, tool_name: &str) -> bool {
        self.dangerous_tools.contains(tool_name)
            || self
                .dangerous_operations
                .iter()
                .any(|op| tool_name.contains(op))
    }
}

#[derive(Debug, Clone)]
pub struct ToolExecutionContext {
    pending: Vec<PendingToolRequest>,
    current: Option<CurrentToolExecution>,
    auto_loop_depth: u32,
    tools_executed: u32,
    policy: ToolApprovalPolicy,
    timeout_config: ToolTimeoutConfig,
    safety_config: ToolSafetyConfig,
    loop_started_at: Option<DateTime<Utc>>,
    executed_tools_history: Vec<String>,
}

impl Default for ToolExecutionContext {
    fn default() -> Self {
        Self {
            pending: Vec::new(),
            current: None,
            auto_loop_depth: 0,
            tools_executed: 0,
            policy: ToolApprovalPolicy::default(),
            timeout_config: ToolTimeoutConfig::default(),
            safety_config: ToolSafetyConfig::default(),
            loop_started_at: None,
            executed_tools_history: Vec::new(),
        }
    }
}

impl ToolExecutionContext {
    pub fn reset(&mut self) {
        self.pending.clear();
        self.current = None;
        self.auto_loop_depth = 0;
        self.tools_executed = 0;
        self.loop_started_at = None;
        self.executed_tools_history.clear();
    }

    /// Configure timeout settings
    pub fn set_timeout_config(&mut self, config: ToolTimeoutConfig) {
        self.timeout_config = config;
    }

    /// Configure safety settings
    pub fn set_safety_config(&mut self, config: ToolSafetyConfig) {
        self.safety_config = config;
    }

    /// Get timeout configuration
    pub fn timeout_config(&self) -> &ToolTimeoutConfig {
        &self.timeout_config
    }

    /// Get safety configuration
    pub fn safety_config(&self) -> &ToolSafetyConfig {
        &self.safety_config
    }

    pub fn add_pending(&mut self, request_id: Uuid, tool_name: String) {
        if self
            .pending
            .iter()
            .any(|request| request.request_id == request_id)
        {
            return;
        }

        self.pending.push(PendingToolRequest {
            request_id,
            tool_name,
            created_at: Utc::now(),
        });
    }

    pub fn clear_pending(&mut self) {
        self.pending.clear();
    }

    pub fn pending_snapshot(&self) -> (Vec<Uuid>, Vec<String>) {
        (
            self.pending.iter().map(|p| p.request_id).collect(),
            self.pending.iter().map(|p| p.tool_name.clone()).collect(),
        )
    }

    fn remove_pending(&mut self, request_id: &Uuid) -> Option<PendingToolRequest> {
        if let Some(index) = self
            .pending
            .iter()
            .position(|request| &request.request_id == request_id)
        {
            Some(self.pending.remove(index))
        } else {
            None
        }
    }

    fn remove_pending_by_tool(&mut self, tool_name: &str) -> Option<PendingToolRequest> {
        if let Some(index) = self
            .pending
            .iter()
            .position(|request| request.tool_name == tool_name)
        {
            Some(self.pending.remove(index))
        } else {
            None
        }
    }

    pub fn start_execution(&mut self, tool_name: String, attempt: u8, request_id: Option<Uuid>) {
        if let Some(id) = request_id {
            self.remove_pending(&id);
        } else {
            self.remove_pending_by_tool(&tool_name);
        }

        let timeout_ms = Some(self.timeout_config.get_timeout(&tool_name));

        self.current = Some(CurrentToolExecution {
            request_id,
            tool_name: tool_name.clone(),
            attempt,
            started_at: Utc::now(),
            timeout_ms,
        });

        self.executed_tools_history.push(tool_name);
    }

    pub fn current(&self) -> Option<&CurrentToolExecution> {
        self.current.as_ref()
    }

    pub fn update_attempt(&mut self, attempt: u8) {
        if let Some(current) = self.current.as_mut() {
            current.attempt = attempt;
        }
    }

    pub fn complete_execution(&mut self) {
        self.current = None;
    }

    pub fn begin_auto_loop(&mut self, depth: u32) {
        self.auto_loop_depth = depth.max(1);
        self.tools_executed = 0;
        self.loop_started_at = Some(Utc::now());
        self.executed_tools_history.clear();
    }

    pub fn increment_tools_executed(&mut self) {
        self.tools_executed = self.tools_executed.saturating_add(1);
    }

    pub fn tools_executed(&self) -> u32 {
        self.tools_executed
    }

    pub fn auto_loop_depth(&self) -> u32 {
        self.auto_loop_depth
    }

    /// Get the history of executed tools in this loop
    pub fn executed_tools_history(&self) -> &[String] {
        &self.executed_tools_history
    }

    /// Check if the auto-loop has timed out
    pub fn is_loop_timed_out(&self) -> bool {
        if let Some(started) = self.loop_started_at {
            let elapsed = Utc::now().signed_duration_since(started).num_milliseconds();
            elapsed > self.timeout_config.max_loop_timeout_ms as i64
        } else {
            false
        }
    }

    /// Check if the current tool execution has timed out
    pub fn is_current_execution_timed_out(&self) -> bool {
        self.current
            .as_ref()
            .map(|c| c.is_timed_out())
            .unwrap_or(false)
    }

    pub fn set_policy(&mut self, policy: ToolApprovalPolicy) {
        self.policy = policy;
    }

    pub fn policy(&self) -> &ToolApprovalPolicy {
        &self.policy
    }

    pub fn can_continue(&self) -> bool {
        self.policy
            .can_continue_loop(self.auto_loop_depth, self.tools_executed)
    }

    /// Check if a tool should be auto-approved
    /// Takes into account both the policy and safety configuration
    pub fn should_auto_approve(&self, tool_name: &str) -> bool {
        // Dangerous tools always require manual approval
        if self.safety_config.is_dangerous_tool(tool_name) {
            return false;
        }

        self.policy
            .should_auto_approve(tool_name, self.auto_loop_depth, self.tools_executed)
    }

    /// Check if a tool is considered dangerous
    pub fn is_dangerous_tool(&self, tool_name: &str) -> bool {
        self.safety_config.is_dangerous_tool(tool_name)
    }
}

/// Tool approval policy determines how tool calls are approved
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ToolApprovalPolicy {
    /// All tool calls require manual approval
    Manual,

    /// All tool calls are automatically approved
    AutoApprove,

    /// Only whitelisted tools are automatically approved, others require manual approval
    WhiteList {
        /// List of tool names that can be auto-approved
        approved_tools: Vec<String>,
    },

    /// Automatically approve tools with depth and count limits
    AutoLoop { max_depth: u32, max_tools: u32 },
}

impl Default for ToolApprovalPolicy {
    fn default() -> Self {
        ToolApprovalPolicy::AutoLoop {
            max_depth: 5,
            max_tools: 20,
        }
    }
}

impl ToolApprovalPolicy {
    /// Check if a tool should be automatically approved according to this policy
    pub fn should_auto_approve(
        &self,
        tool_name: &str,
        current_depth: u32,
        tools_executed: u32,
    ) -> bool {
        match self {
            ToolApprovalPolicy::Manual => false,
            ToolApprovalPolicy::AutoApprove => true,
            ToolApprovalPolicy::WhiteList { approved_tools } => {
                approved_tools.iter().any(|t| t == tool_name)
            }
            ToolApprovalPolicy::AutoLoop {
                max_depth,
                max_tools,
            } => current_depth <= *max_depth && tools_executed < *max_tools,
        }
    }

    /// Check if we can continue the auto-loop
    pub fn can_continue_loop(&self, current_depth: u32, tools_executed: u32) -> bool {
        match self {
            ToolApprovalPolicy::Manual => false,
            ToolApprovalPolicy::AutoApprove => true,
            ToolApprovalPolicy::WhiteList { .. } => true,
            ToolApprovalPolicy::AutoLoop {
                max_depth,
                max_tools,
            } => current_depth <= *max_depth && tools_executed < *max_tools,
        }
    }
}
