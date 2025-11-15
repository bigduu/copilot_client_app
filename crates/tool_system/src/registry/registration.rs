//! Centralized tool registration
//!
//! This module provides a Spring-like bean registration system where all tools
//! are explicitly registered in a single place. This is similar to Spring's
//! @Configuration classes or component scanning.

use std::sync::Arc;
use crate::registry::ToolRegistry;

// Import all tool types that need to be registered
use crate::extensions::file_operations::{
    AppendFileTool, CreateFileTool, DeleteFileTool, EditLinesTool,
    ListDirectoryTool, ReadFileTool, ReplaceInFileTool, UpdateFileTool,
};
use crate::extensions::search::{GlobSearchTool, GrepSearchTool, SimpleSearchTool};

/// Registers all available tools in the registry
///
/// This function is the central place where all tools are registered.
/// Similar to Spring's @Bean methods or component scanning, this provides
/// an explicit, easy-to-understand registration point.
///
/// # Arguments
///
/// * `registry` - The tool registry to register tools into
///
/// # Example
///
/// ```rust,ignore
/// let registry = ToolRegistry::new();
/// register_all_tools(&registry);
///
/// // Now all tools are available
/// let tool = registry.get_tool("read_file");
/// ```
pub fn register_all_tools(registry: &ToolRegistry) {
    // File operation tools
    registry.register_factory(Arc::new(ReadFileTool::new()));
    registry.register_factory(Arc::new(CreateFileTool::new()));
    registry.register_factory(Arc::new(UpdateFileTool::new()));
    registry.register_factory(Arc::new(AppendFileTool::new()));
    registry.register_factory(Arc::new(DeleteFileTool::new()));
    registry.register_factory(Arc::new(ListDirectoryTool::new()));
    registry.register_factory(Arc::new(ReplaceInFileTool::new()));
    registry.register_factory(Arc::new(EditLinesTool::new()));

    // Search tools
    registry.register_factory(Arc::new(SimpleSearchTool::new()));
    registry.register_factory(Arc::new(GrepSearchTool::new()));
    registry.register_factory(Arc::new(GlobSearchTool::new()));
}

/// Creates a new tool registry with all tools pre-registered
///
/// This is a convenience function that combines registry creation and registration.
/// Similar to Spring's ApplicationContext initialization.
///
/// # Returns
///
/// A fully initialized ToolRegistry with all available tools registered
///
/// # Example
///
/// ```rust,ignore
/// let registry = create_default_tool_registry();
/// let tool = registry.get_tool("read_file");
/// ```
pub fn create_default_tool_registry() -> ToolRegistry {
    let registry = ToolRegistry::new();
    register_all_tools(&registry);
    registry
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_register_all_tools() {
        let registry = ToolRegistry::new();
        register_all_tools(&registry);

        // Verify all tools are registered
        assert!(registry.get_tool("read_file").is_some());
        assert!(registry.get_tool("create_file").is_some());
        assert!(registry.get_tool("update_file").is_some());
        assert!(registry.get_tool("append_file").is_some());
        assert!(registry.get_tool("delete_file").is_some());
        assert!(registry.get_tool("list_directory").is_some());
        assert!(registry.get_tool("replace_in_file").is_some());
        assert!(registry.get_tool("edit_lines").is_some());
        assert!(registry.get_tool("search").is_some());
        assert!(registry.get_tool("grep").is_some());
        assert!(registry.get_tool("glob").is_some());
    }

    #[test]
    fn test_create_default_tool_registry() {
        let registry = create_default_tool_registry();

        // Verify tools are accessible
        assert!(registry.get_tool("read_file").is_some());
        assert!(registry.get_tool("grep").is_some());

        // Verify registry has the expected number of tools
        assert!(registry.factory_count() >= 11);
    }

    #[test]
    fn test_tool_definitions() {
        let registry = create_default_tool_registry();
        let definitions = registry.list_tool_definitions();

        // Verify we have tool definitions
        assert!(!definitions.is_empty());

        // Verify each definition has required fields
        for def in definitions {
            assert!(!def.name.is_empty());
            assert!(!def.description.is_empty());
        }
    }
}
