//! Registration System for Tools and Categories
//!
//! This module provides a registration-based system where:
//! 1. Tools register themselves and declare which categories they belong to
//! 2. Categories are created and registered
//! 3. ToolManager is built from registered components
//! 4. No hardcoded strings - everything is type-safe and self-registering

use crate::tools::categories::*;
use crate::tools::category::Category;
use crate::tools::file_tools::*;
use crate::tools::registry::MasterRegistry;
use crate::tools::tool_manager::ToolManager;
use crate::tools::tool_types::CategoryId;
use crate::tools::Tool;
use std::sync::Arc;

/// Registration system that builds the complete tool ecosystem
pub struct RegistrationSystem;

impl RegistrationSystem {
    /// Create a fully configured ToolManager with all registered tools and categories
    pub fn create_tool_manager() -> ToolManager {
        let mut registry = MasterRegistry::new();

        // Register all tools
        Self::register_all_tools(&mut registry);

        // Register all categories
        Self::register_all_categories(&mut registry);

        // Build ToolManager from registry
        Self::build_tool_manager_from_registry(registry)
    }

    /// Register all available tools
    fn register_all_tools(registry: &mut MasterRegistry) {
        // File operation tools
        registry.register_tool(Arc::new(ReadFileTool));
        registry.register_tool(Arc::new(CreateFileTool));
        registry.register_tool(Arc::new(DeleteFileTool));
        registry.register_tool(Arc::new(UpdateFileTool));
        registry.register_tool(Arc::new(AppendFileTool));
        registry.register_tool(Arc::new(SearchFilesTool));
        registry.register_tool(Arc::new(SimpleSearchTool));

        // Command execution tools
        registry.register_tool(Arc::new(ExecuteCommandTool));

        // Future tools can be added here without modifying categories
    }

    /// Register all available categories
    fn register_all_categories(registry: &mut MasterRegistry) {
        registry.register_category(Box::new(FileOperationsCategory::new()));
        registry.register_category(Box::new(CommandExecutionCategory::new()));
        registry.register_category(Box::new(GeneralAssistantCategory::new()));

        // Future categories can be added here
    }

    /// Build ToolManager from the registry
    fn build_tool_manager_from_registry(registry: MasterRegistry) -> ToolManager {
        // Convert registry to the format expected by ToolManager
        let categories = registry
            .get_enabled_categories()
            .into_iter()
            .map(|category_ref| {
                // Create a new category instance that uses the registry for tools
                Self::create_registry_backed_category(category_ref, &registry)
            })
            .collect();

        ToolManager::new(categories)
    }

    /// Create a category that gets its tools from the registry
    fn create_registry_backed_category(
        original_category: &Box<dyn Category>,
        registry: &MasterRegistry,
    ) -> Box<dyn Category> {
        // For now, we'll use the original category implementation
        // In a more advanced version, we could create a wrapper that
        // dynamically gets tools from the registry

        // This is a simplified approach - we're keeping the existing category
        // but the tools are now self-registering through their categories() method
        Box::new(RegistryBackedCategory {
            original: original_category.id(),
            registry_tools: registry.get_category_tools(
                &CategoryId::from_str(&original_category.id())
                    .unwrap_or(CategoryId::GeneralAssistant),
            ),
            category_data: CategoryData {
                id: original_category.id(),
                name: original_category.name(),
                display_name: original_category.display_name(),
                description: original_category.description(),
                system_prompt: original_category.system_prompt(),
                icon: original_category.icon(),
                frontend_icon: original_category.frontend_icon(),
                color: original_category.color(),
                strict_tools_mode: original_category.strict_tools_mode(),
                priority: original_category.priority(),
                enabled: original_category.enable(),
                category_type: original_category.category_type(),
            },
        })
    }
}

/// Data structure to hold category information
#[derive(Clone)]
struct CategoryData {
    id: String,
    name: String,
    display_name: String,
    description: String,
    system_prompt: String,
    icon: String,
    frontend_icon: String,
    color: String,
    strict_tools_mode: bool,
    priority: i32,
    enabled: bool,
    category_type: crate::tools::tool_types::CategoryType,
}

/// A category implementation that gets its tools from the registry
struct RegistryBackedCategory {
    original: String,
    registry_tools: std::collections::HashMap<String, Arc<dyn Tool>>,
    category_data: CategoryData,
}

impl std::fmt::Debug for RegistryBackedCategory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("RegistryBackedCategory")
            .field("id", &self.category_data.id)
            .field("name", &self.category_data.name)
            .finish()
    }
}

impl Category for RegistryBackedCategory {
    fn id(&self) -> String {
        self.category_data.id.clone()
    }
    fn name(&self) -> String {
        self.category_data.name.clone()
    }
    fn display_name(&self) -> String {
        self.category_data.display_name.clone()
    }
    fn description(&self) -> String {
        self.category_data.description.clone()
    }
    fn system_prompt(&self) -> String {
        self.category_data.system_prompt.clone()
    }
    fn icon(&self) -> String {
        self.category_data.icon.clone()
    }
    fn frontend_icon(&self) -> String {
        self.category_data.frontend_icon.clone()
    }
    fn color(&self) -> String {
        self.category_data.color.clone()
    }
    fn strict_tools_mode(&self) -> bool {
        self.category_data.strict_tools_mode
    }
    fn priority(&self) -> i32 {
        self.category_data.priority
    }
    fn enable(&self) -> bool {
        self.category_data.enabled
    }
    fn category_type(&self) -> crate::tools::tool_types::CategoryType {
        self.category_data.category_type.clone()
    }

    fn tools(&self) -> std::collections::HashMap<String, Arc<dyn Tool>> {
        self.registry_tools.clone()
    }
}

/// Create the default tool manager using the registration system
pub fn create_registered_tool_manager() -> ToolManager {
    RegistrationSystem::create_tool_manager()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_registration_system() {
        let tool_manager = RegistrationSystem::create_tool_manager();

        // Verify that tools are properly registered to categories
        let file_tools = tool_manager.get_category_tools("file_operations");
        assert!(!file_tools.is_empty());

        let cmd_tools = tool_manager.get_category_tools("command_execution");
        assert!(!cmd_tools.is_empty());

        // Verify that tools know their categories
        let all_tools = tool_manager.list_tools_for_ui();
        assert!(!all_tools.is_empty());
    }
}
