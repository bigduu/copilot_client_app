//! Configuration Management Tests
//!
//! Tests various functions of the tool configuration manager

#[cfg(test)]
mod tests {
    use crate::tools::config_manager::{ConfigManagerBuilder, ToolConfigManager};
    use crate::tools::tool_types::{CategoryType, ToolCategory, ToolConfig};

    #[test]
    fn test_config_manager_creation() {
        let config_manager = ToolConfigManager::default();

        assert_eq!(config_manager.get_available_tools().len(), 0);
        assert_eq!(config_manager.get_categories().len(), 0);
    }

    #[test]
    fn test_tool_config_registration() {
        let mut config_manager = ToolConfigManager::default();

        let tool_config = ToolConfig {
            name: "test_tool".to_string(),
            display_name: "Test Tool".to_string(),
            description: "This is a test tool".to_string(),
            category_id: "test_category".to_string(),
            enabled: true,
            requires_approval: false,
            auto_prefix: Some("/test".to_string()),
            permissions: vec!["read".to_string()],
            tool_type: "AIParameterParsing".to_string(),
            parameter_regex: None,
            custom_prompt: None,
        };

        config_manager.register_tool_config(tool_config.clone());

        assert!(config_manager.tool_exists("test_tool"));
        assert!(config_manager.is_tool_enabled("test_tool"));
        assert_eq!(config_manager.get_available_tools().len(), 1);

        let retrieved_config = config_manager.get_tool_config("test_tool").unwrap();
        assert_eq!(retrieved_config.name, "test_tool");
        assert_eq!(retrieved_config.display_name, "Test Tool");
    }

    #[test]
    fn test_category_management() {
        let mut config_manager = ToolConfigManager::default();

        let category = ToolCategory {
            id: "test_category".to_string(),
            name: "test_category".to_string(),
            display_name: "Test Category".to_string(),
            description: "Category for testing".to_string(),
            icon: "🧪".to_string(),
            enabled: true,
            strict_tools_mode: false,
            system_prompt: "System prompt for test category".to_string(),
            category_type: CategoryType::GeneralAssistant,
        };

        config_manager.set_custom_categories(vec![category.clone()]);

        assert!(config_manager.category_exists("test_category"));
        assert_eq!(config_manager.get_categories().len(), 1);
        assert_eq!(config_manager.get_enabled_categories_count(), 1);

        let categories = config_manager.get_tool_categories();
        assert_eq!(categories[0].display_name, "Test Category");
    }

    #[test]
    fn test_tool_enable_disable() {
        let mut config_manager = ToolConfigManager::default();

        let tool_config = ToolConfig {
            name: "toggle_tool".to_string(),
            display_name: "Toggle Tool".to_string(),
            description: "Tool for testing enable/disable functionality".to_string(),
            category_id: "test".to_string(),
            enabled: true,
            requires_approval: false,
            auto_prefix: None,
            permissions: vec![],
            tool_type: "AIParameterParsing".to_string(),
            parameter_regex: None,
            custom_prompt: None,
        };

        config_manager.register_tool_config(tool_config);

        // Initial state should be enabled
        assert!(config_manager.is_tool_enabled("toggle_tool"));

        // Disable tool
        config_manager.disable_tool("toggle_tool").unwrap();
        assert!(!config_manager.is_tool_enabled("toggle_tool"));

        // Re-enable tool
        config_manager.enable_tool("toggle_tool").unwrap();
        assert!(config_manager.is_tool_enabled("toggle_tool"));
    }

    #[test]
    fn test_category_enable_disable() {
        let mut config_manager = ToolConfigManager::default();

        let category = ToolCategory {
            id: "toggle_category".to_string(),
            name: "toggle_category".to_string(),
            display_name: "Toggle Category".to_string(),
            description: "Category for testing enable/disable".to_string(),
            icon: "🔧".to_string(),
            enabled: true,
            strict_tools_mode: false,
            system_prompt: "System prompt for toggle category".to_string(),
            category_type: CategoryType::GeneralAssistant,
        };

        config_manager.set_custom_categories(vec![category]);

        // Initial state should be enabled
        assert_eq!(config_manager.get_enabled_categories_count(), 1);

        // Disable category
        config_manager.disable_category("toggle_category").unwrap();
        assert_eq!(config_manager.get_enabled_categories_count(), 0);

        // Re-enable category
        config_manager.enable_category("toggle_category").unwrap();
        assert_eq!(config_manager.get_enabled_categories_count(), 1);
    }

    #[test]
    fn test_config_update() {
        let mut config_manager = ToolConfigManager::default();

        let original_config = ToolConfig {
            name: "update_tool".to_string(),
            display_name: "Original Tool".to_string(),
            description: "Original description".to_string(),
            category_id: "original".to_string(),
            enabled: true,
            requires_approval: false,
            auto_prefix: None,
            permissions: vec![],
            tool_type: "AIParameterParsing".to_string(),
            parameter_regex: None,
            custom_prompt: None,
        };

        config_manager.register_tool_config(original_config);

        let updated_config = ToolConfig {
            name: "update_tool".to_string(),
            display_name: "Updated Tool".to_string(),
            description: "Updated description".to_string(),
            category_id: "updated".to_string(),
            enabled: false,
            requires_approval: true,
            auto_prefix: Some("/updated".to_string()),
            permissions: vec!["write".to_string()],
            tool_type: "RegexParameterExtraction".to_string(),
            parameter_regex: Some(r"test_(\w+)".to_string()),
            custom_prompt: Some("Updated prompt".to_string()),
        };

        config_manager
            .update_tool_config("update_tool", updated_config)
            .unwrap();

        let retrieved_config = config_manager.get_tool_config("update_tool").unwrap();
        assert_eq!(retrieved_config.display_name, "Updated Tool");
        assert_eq!(retrieved_config.description, "Updated description");
        assert_eq!(retrieved_config.category_id, "updated");
        assert!(!retrieved_config.enabled);
        assert!(retrieved_config.requires_approval);
    }

    #[test]
    fn test_tools_by_category() {
        let mut config_manager = ToolConfigManager::default();

        let tool1 = ToolConfig {
            name: "cat1_tool1".to_string(),
            display_name: "Category1 Tool1".to_string(),
            description: "".to_string(),
            category_id: "category1".to_string(),
            enabled: true,
            requires_approval: false,
            auto_prefix: None,
            permissions: vec![],
            tool_type: "AIParameterParsing".to_string(),
            parameter_regex: None,
            custom_prompt: None,
        };

        let tool2 = ToolConfig {
            name: "cat1_tool2".to_string(),
            display_name: "Category1 Tool2".to_string(),
            description: "".to_string(),
            category_id: "category1".to_string(),
            enabled: true,
            requires_approval: false,
            auto_prefix: None,
            permissions: vec![],
            tool_type: "AIParameterParsing".to_string(),
            parameter_regex: None,
            custom_prompt: None,
        };

        let tool3 = ToolConfig {
            name: "cat2_tool1".to_string(),
            display_name: "Category2 Tool1".to_string(),
            description: "".to_string(),
            category_id: "category2".to_string(),
            enabled: true,
            requires_approval: false,
            auto_prefix: None,
            permissions: vec![],
            tool_type: "AIParameterParsing".to_string(),
            parameter_regex: None,
            custom_prompt: None,
        };

        config_manager.register_tool_config(tool1);
        config_manager.register_tool_config(tool2);
        config_manager.register_tool_config(tool3);

        let cat1_tools = config_manager.get_tools_by_category("category1");
        let cat2_tools = config_manager.get_tools_by_category("category2");
        let cat3_tools = config_manager.get_tools_by_category("category3");

        assert_eq!(cat1_tools.len(), 2);
        assert_eq!(cat2_tools.len(), 1);
        assert_eq!(cat3_tools.len(), 0);

        let cat1_tool_names: Vec<String> = cat1_tools.iter().map(|t| t.name.clone()).collect();
        assert!(cat1_tool_names.contains(&"cat1_tool1".to_string()));
        assert!(cat1_tool_names.contains(&"cat1_tool2".to_string()));
    }

    #[test]
    fn test_config_manager_builder() {
        let tool_config = ToolConfig {
            name: "builder_tool".to_string(),
            display_name: "Builder Tool".to_string(),
            description: "Created through builder pattern".to_string(),
            category_id: "builder_category".to_string(),
            enabled: true,
            requires_approval: false,
            auto_prefix: None,
            permissions: vec![],
            tool_type: "AIParameterParsing".to_string(),
            parameter_regex: None,
            custom_prompt: None,
        };

        let category = ToolCategory {
            id: "builder_category".to_string(),
            name: "builder_category".to_string(),
            display_name: "Builder Category".to_string(),
            description: "Category created through builder pattern".to_string(),
            icon: "🔧".to_string(),
            enabled: true,
            strict_tools_mode: false,
            system_prompt: "System prompt for builder category".to_string(),
            category_type: CategoryType::GeneralAssistant,
        };

        let config_manager = ConfigManagerBuilder::new()
            .with_tool_config(tool_config)
            .with_category(category)
            .build();

        assert!(config_manager.tool_exists("builder_tool"));
        assert!(config_manager.category_exists("builder_category"));
        assert_eq!(config_manager.get_available_tools().len(), 1);
        assert_eq!(config_manager.get_categories().len(), 1);
    }

    #[test]
    fn test_approval_and_permissions() {
        let mut config_manager = ToolConfigManager::default();

        let tool_config = ToolConfig {
            name: "secure_tool".to_string(),
            display_name: "Security Tool".to_string(),
            description: "Tool requiring approval and permissions".to_string(),
            category_id: "secure".to_string(),
            enabled: true,
            requires_approval: true,
            auto_prefix: None,
            permissions: vec!["admin".to_string(), "write".to_string()],
            tool_type: "AIParameterParsing".to_string(),
            parameter_regex: None,
            custom_prompt: None,
        };

        config_manager.register_tool_config(tool_config);

        assert!(config_manager.requires_approval("secure_tool"));

        let permissions = config_manager.get_tool_permissions("secure_tool");
        assert_eq!(permissions.len(), 2);
        assert!(permissions.contains(&"admin".to_string()));
        assert!(permissions.contains(&"write".to_string()));
    }

    #[test]
    fn test_display_names() {
        let mut config_manager = ToolConfigManager::default();

        let tool_config = ToolConfig {
            name: "display_tool".to_string(),
            display_name: "Display Tool".to_string(),
            description: "Test display name".to_string(),
            category_id: "display_category".to_string(),
            enabled: true,
            requires_approval: false,
            auto_prefix: None,
            permissions: vec![],
            tool_type: "AIParameterParsing".to_string(),
            parameter_regex: None,
            custom_prompt: None,
        };

        let category = ToolCategory {
            id: "display_category".to_string(),
            name: "display_category".to_string(),
            display_name: "Display Category".to_string(),
            description: "Test category display name".to_string(),
            icon: "🔧".to_string(),
            enabled: true,
            strict_tools_mode: false,
            system_prompt: "System prompt for display category".to_string(),
            category_type: CategoryType::GeneralAssistant,
        };

        config_manager.register_tool_config(tool_config);
        config_manager.set_custom_categories(vec![category]);

        assert_eq!(
            config_manager
                .get_tool_display_name("display_tool")
                .unwrap(),
            "Display Tool"
        );
        assert_eq!(
            config_manager
                .get_category_display_name("display_category")
                .unwrap(),
            "Display Category"
        );

        // Test non-existent items
        assert!(config_manager
            .get_tool_display_name("nonexistent")
            .is_none());
        assert!(config_manager
            .get_category_display_name("nonexistent")
            .is_none());
    }
}
