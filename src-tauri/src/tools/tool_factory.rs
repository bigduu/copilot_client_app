//! Tool Factory
//!
//! Provides a centralized way to register and create tools

use crate::tools::file_tools::*;
use crate::tools::Tool;
use std::collections::HashMap;
use std::sync::Arc;

/// Tool Factory for creating and registering tools
pub struct ToolFactory {
    /// Registry of tool constructors
    constructors: HashMap<String, Box<dyn Fn() -> Arc<dyn Tool> + Send + Sync>>,
}

impl ToolFactory {
    /// Create a new ToolFactory
    pub fn new() -> Self {
        let mut factory = Self {
            constructors: HashMap::new(),
        };
        
        // Register default tools
        factory.register_defaults();
        factory
    }

    /// Register a tool constructor
    pub fn register<F>(&mut self, name: &str, constructor: F)
    where
        F: Fn() -> Arc<dyn Tool> + Send + Sync + 'static,
    {
        self.constructors.insert(name.to_string(), Box::new(constructor));
    }

    /// Create a tool by name
    pub fn create(&self, name: &str) -> Option<Arc<dyn Tool>> {
        self.constructors.get(name).map(|constructor| constructor())
    }

    /// Get all registered tool names
    pub fn get_registered_names(&self) -> Vec<String> {
        self.constructors.keys().cloned().collect()
    }

    /// Create tools from a list of names
    pub fn create_tools(&self, names: &[&str]) -> HashMap<String, Arc<dyn Tool>> {
        let mut tools = HashMap::new();
        for name in names {
            if let Some(tool) = self.create(name) {
                tools.insert(name.to_string(), tool);
            }
        }
        tools
    }

    /// Create all registered tools
    pub fn create_all(&self) -> HashMap<String, Arc<dyn Tool>> {
        let mut tools = HashMap::new();
        for (name, constructor) in &self.constructors {
            tools.insert(name.clone(), constructor());
        }
        tools
    }

    /// Register default tools
    fn register_defaults(&mut self) {
        // File operation tools
        self.register("read_file", || Arc::new(ReadFileTool));
        self.register("create_file", || Arc::new(CreateFileTool));
        self.register("delete_file", || Arc::new(DeleteFileTool));
        self.register("update_file", || Arc::new(UpdateFileTool));
        self.register("append_file", || Arc::new(AppendFileTool));
        self.register("search_files", || Arc::new(SearchFilesTool));
        self.register("search", || Arc::new(SimpleSearchTool));
        
        // Command execution tools
        self.register("execute_command", || Arc::new(ExecuteCommandTool));
    }

    /// Get tools for a specific category
    pub fn get_category_tools(&self, category: &str) -> HashMap<String, Arc<dyn Tool>> {
        match category {
            "file_operations" => self.create_tools(&[
                "read_file",
                "create_file", 
                "delete_file",
                "update_file",
                "append_file",
                "search_files",
                "search"
            ]),
            "command_execution" => self.create_tools(&[
                "execute_command"
            ]),
            "general_assistant" => HashMap::new(), // No specific tools for general assistant
            _ => HashMap::new(),
        }
    }
}

impl Default for ToolFactory {
    fn default() -> Self {
        Self::new()
    }
}

/// Global tool factory instance
static mut TOOL_FACTORY: Option<ToolFactory> = None;
static INIT: std::sync::Once = std::sync::Once::new();

/// Get the global tool factory instance
pub fn get_tool_factory() -> &'static ToolFactory {
    unsafe {
        INIT.call_once(|| {
            TOOL_FACTORY = Some(ToolFactory::new());
        });
        TOOL_FACTORY.as_ref().unwrap()
    }
}

/// Create tools for a specific category
pub fn create_category_tools(category: &str) -> HashMap<String, Arc<dyn Tool>> {
    let factory = get_tool_factory();
    factory.get_category_tools(category)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_factory() {
        let factory = ToolFactory::new();
        
        // Test creating tools
        let read_file = factory.create("read_file");
        assert!(read_file.is_some());
        
        let create_file = factory.create("create_file");
        assert!(create_file.is_some());
        
        // Test unknown tool
        let unknown = factory.create("unknown");
        assert!(unknown.is_none());
    }

    #[test]
    fn test_category_tools() {
        let factory = ToolFactory::new();
        
        let file_tools = factory.get_category_tools("file_operations");
        assert!(!file_tools.is_empty());
        assert!(file_tools.contains_key("read_file"));
        assert!(file_tools.contains_key("create_file"));
        
        let cmd_tools = factory.get_category_tools("command_execution");
        assert!(!cmd_tools.is_empty());
        assert!(cmd_tools.contains_key("execute_command"));
        
        let general_tools = factory.get_category_tools("general_assistant");
        assert!(general_tools.is_empty()); // No specific tools
    }

    #[test]
    fn test_create_all_tools() {
        let factory = ToolFactory::new();
        let all_tools = factory.create_all();
        
        assert!(!all_tools.is_empty());
        assert!(all_tools.contains_key("read_file"));
        assert!(all_tools.contains_key("execute_command"));
    }
}
