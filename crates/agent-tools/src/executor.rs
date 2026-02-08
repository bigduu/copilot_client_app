use std::sync::Arc;

use agent_core::tools::{
    normalize_tool_name, Tool, ToolCall, ToolError, ToolExecutor, ToolResult, ToolSchema,
};
use async_trait::async_trait;
use serde_json::json;

use crate::guide::{context::GuideBuildContext, EnhancedPromptBuilder, ToolGuide};
use crate::tools::{
    ApplyPatchTool, AskUserTool, CreateTodoListTool, ExecuteCommandTool, FileExistsTool,
    GetCurrentDirTool, GetFileInfoTool, GitDiffTool, GitStatusTool, ListDirectoryTool, ReadFileTool,
    ReadFileRangeTool, SearchInFileTool, SearchInProjectTool, SetWorkspaceTool, ToolRegistry,
    UpdateTodoItemTool, WriteFileTool,
};

/// List of all built-in tool names
pub const BUILTIN_TOOL_NAMES: [&str; 17] = [
    "read_file",
    "write_file",
    "list_directory",
    "file_exists",
    "get_file_info",
    "execute_command",
    "ask_user",
    "get_current_dir",
    "set_workspace",
    "read_file_range",
    "search_in_file",
    "apply_patch",
    "search_in_project",
    "git_status",
    "git_diff",
    "create_todo_list",
    "update_todo_item",
];

/// Normalizes a tool reference to a standard tool name
///
/// Handles legacy aliases like "run_command" -> "execute_command"
/// Returns None if the tool name is not recognized
pub fn normalize_tool_ref(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    let raw_tool_name = trimmed.split("::").last().unwrap_or(trimmed);
    let tool_name = match raw_tool_name {
        "run_command" => "execute_command",
        _ => raw_tool_name,
    };
    if BUILTIN_TOOL_NAMES.iter().any(|name| name == &tool_name) {
        Some(tool_name.to_string())
    } else {
        None
    }
}

/// Checks if a tool reference is a built-in tool
pub fn is_builtin_tool(value: &str) -> bool {
    normalize_tool_ref(value).is_some()
}

/// Built-in tool executor that uses ToolRegistry for dynamic dispatch
pub struct BuiltinToolExecutor {
    registry: ToolRegistry,
}

impl BuiltinToolExecutor {
    /// Creates a new executor with all built-in tools registered
    pub fn new() -> Self {
        let registry = ToolRegistry::new();
        Self::register_builtin_tools(&registry);
        Self { registry }
    }

    /// Creates a new executor from an existing registry
    pub fn with_registry(registry: ToolRegistry) -> Self {
        Self { registry }
    }

    /// Returns a reference to the internal registry
    pub fn registry(&self) -> &ToolRegistry {
        &self.registry
    }

    /// Registers all built-in tools to the given registry
    fn register_builtin_tools(registry: &ToolRegistry) {
        // Register filesystem tools
        let _ = registry.register(ReadFileTool::new());
        let _ = registry.register(WriteFileTool::new());
        let _ = registry.register(ListDirectoryTool::new());
        let _ = registry.register(FileExistsTool::new());
        let _ = registry.register(GetFileInfoTool::new());

        // Register command tools
        let _ = registry.register(ExecuteCommandTool::new());
        let _ = registry.register(AskUserTool::new());
        let _ = registry.register(GetCurrentDirTool::new());

        // Register workspace tools
        let _ = registry.register(SetWorkspaceTool::new());

        // Register advanced file tools
        let _ = registry.register(ReadFileRangeTool::new());
        let _ = registry.register(SearchInFileTool::new());
        let _ = registry.register(ApplyPatchTool::new());

        // Register project-wide tools
        let _ = registry.register(SearchInProjectTool::new());

        // Register git tools
        let _ = registry.register(GitStatusTool::new());
        let _ = registry.register(GitDiffTool::new());

        // Register todo list tools
        let _ = registry.register(CreateTodoListTool::new());
        let _ = registry.register(UpdateTodoItemTool::new());
    }

    /// Returns all built-in tool schemas
    pub fn tool_schemas() -> Vec<ToolSchema> {
        let registry = ToolRegistry::new();
        Self::register_builtin_tools(&registry);
        registry.list_tools()
    }

    /// Registers a custom tool to this executor
    pub fn register_tool<T: Tool + 'static>(&self, tool: T) -> Result<(), ToolError> {
        self.registry
            .register(tool)
            .map_err(|e| ToolError::Execution(e.to_string()))
    }

    /// Register a tool with its guide
    pub fn register_tool_with_guide<T, G>(&self, tool: T, guide: G) -> Result<(), ToolError>
    where
        T: Tool + 'static,
        G: ToolGuide + 'static,
    {
        self.registry
            .register_with_guide(tool, guide)
            .map_err(|e| ToolError::Execution(e.to_string()))
    }

    /// Get guide for a tool
    pub fn get_guide(&self, tool_name: &str) -> Option<Arc<dyn ToolGuide>> {
        self.registry.get_guide(tool_name)
    }

    /// Build enhanced prompt for all registered tools
    pub fn build_enhanced_prompt(&self, context: GuideBuildContext) -> String {
        EnhancedPromptBuilder::build(Some(&self.registry), &self.registry.list_tools(), &context)
    }
}

impl Default for BuiltinToolExecutor {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ToolExecutor for BuiltinToolExecutor {
    async fn execute(&self, call: &ToolCall) -> Result<ToolResult, ToolError> {
        let args_raw = call.function.arguments.trim();
        let args: serde_json::Value = if args_raw.is_empty() {
            json!({})
        } else {
            serde_json::from_str(args_raw).map_err(|e| {
                ToolError::InvalidArguments(format!("Invalid JSON arguments: {}", e))
            })?
        };

        let tool_name = normalize_tool_name(&call.function.name);

        // Look up the tool in the registry
        let tool = self
            .registry
            .get(tool_name)
            .ok_or_else(|| ToolError::NotFound(format!("Tool '{}' not found", tool_name)))?;

        // Execute the tool
        tool.execute(args).await
    }

    fn list_tools(&self) -> Vec<ToolSchema> {
        self.registry.list_tools()
    }
}

/// Builder for constructing a BuiltinToolExecutor with custom tool configurations
pub struct BuiltinToolExecutorBuilder {
    registry: ToolRegistry,
}

impl BuiltinToolExecutorBuilder {
    /// Creates a new builder with no tools registered
    pub fn new() -> Self {
        Self {
            registry: ToolRegistry::new(),
        }
    }

    /// Registers all default built-in tools
    pub fn with_default_tools(self) -> Self {
        BuiltinToolExecutor::register_builtin_tools(&self.registry);
        self
    }

    /// Registers a specific filesystem tool by name
    pub fn with_filesystem_tool(self, name: &str) -> Result<Self, ToolError> {
        match name {
            "read_file" => self.registry.register(ReadFileTool::new()),
            "write_file" => self.registry.register(WriteFileTool::new()),
            "list_directory" => self.registry.register(ListDirectoryTool::new()),
            "file_exists" => self.registry.register(FileExistsTool::new()),
            "get_file_info" => self.registry.register(GetFileInfoTool::new()),
            _ => return Err(ToolError::NotFound(format!("Unknown tool: {}", name))),
        }
        .map_err(|e| ToolError::Execution(e.to_string()))?;
        Ok(self)
    }

    /// Registers a specific command tool by name
    pub fn with_command_tool(self, name: &str) -> Result<Self, ToolError> {
        match name {
            "execute_command" => self.registry.register(ExecuteCommandTool::new()),
            "get_current_dir" => self.registry.register(GetCurrentDirTool::new()),
            _ => return Err(ToolError::NotFound(format!("Unknown tool: {}", name))),
        }
        .map_err(|e| ToolError::Execution(e.to_string()))?;
        Ok(self)
    }

    /// Registers a custom tool
    pub fn with_tool<T: Tool + 'static>(self, tool: T) -> Result<Self, ToolError> {
        self.registry
            .register(tool)
            .map_err(|e| ToolError::Execution(e.to_string()))?;
        Ok(self)
    }

    /// Builds the executor
    pub fn build(self) -> BuiltinToolExecutor {
        BuiltinToolExecutor::with_registry(self.registry)
    }
}

impl Default for BuiltinToolExecutorBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_tool_ref_supports_legacy_run_command_alias() {
        assert_eq!(
            normalize_tool_ref("default::run_command"),
            Some("execute_command".to_string())
        );
    }

    #[test]
    fn test_normalize_tool_ref_rejects_unknown_tool() {
        assert_eq!(normalize_tool_ref("default::search"), None);
    }

    #[test]
    fn test_executor_has_all_builtin_tools() {
        let executor = BuiltinToolExecutor::new();
        let tools = executor.list_tools();

        assert_eq!(tools.len(), BUILTIN_TOOL_NAMES.len());

        let tool_names: Vec<String> = tools.iter().map(|t| t.function.name.clone()).collect();
        for tool_name in BUILTIN_TOOL_NAMES {
            assert!(tool_names.contains(&tool_name.to_string()));
        }
    }

    #[test]
    fn test_executor_builds_enhanced_prompt() {
        let executor = BuiltinToolExecutor::new();
        let prompt = executor.build_enhanced_prompt(GuideBuildContext::default());
        assert!(prompt.contains("## Tool Usage Guidelines"));
        assert!(prompt.contains("**read_file**"));
    }

    #[test]
    fn test_executor_builder_empty() {
        let executor = BuiltinToolExecutorBuilder::new().build();
        assert!(executor.list_tools().is_empty());
    }

    #[test]
    fn test_executor_builder_with_default_tools() {
        let executor = BuiltinToolExecutorBuilder::new()
            .with_default_tools()
            .build();
        assert_eq!(executor.list_tools().len(), BUILTIN_TOOL_NAMES.len());
    }

    #[test]
    fn test_executor_builder_with_specific_tool() {
        let executor = BuiltinToolExecutorBuilder::new()
            .with_filesystem_tool("read_file")
            .unwrap()
            .build();

        let tools = executor.list_tools();
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0].function.name, "read_file");
    }
}
