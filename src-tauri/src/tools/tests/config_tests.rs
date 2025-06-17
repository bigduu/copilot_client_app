//! 配置管理测试
//!
//! 测试工具配置管理器的各项功能

#[cfg(test)]
mod tests {
    use crate::tools::config_manager::{ConfigManagerBuilder, ToolConfigManager};
    use crate::tools::types::{ToolCategory, ToolConfig};

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
            display_name: "测试工具".to_string(),
            description: "这是一个测试工具".to_string(),
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
        assert_eq!(retrieved_config.display_name, "测试工具");
    }

    #[test]
    fn test_category_management() {
        let mut config_manager = ToolConfigManager::default();

        let category = ToolCategory {
            id: "test_category".to_string(),
            name: "test_category".to_string(),
            display_name: "测试类别".to_string(),
            description: "测试用类别".to_string(),
            icon: "🧪".to_string(),
            enabled: true,
            strict_tools_mode: false,
        };

        config_manager.set_custom_categories(vec![category.clone()]);

        assert!(config_manager.category_exists("test_category"));
        assert_eq!(config_manager.get_categories().len(), 1);
        assert_eq!(config_manager.get_enabled_categories_count(), 1);

        let categories = config_manager.get_tool_categories();
        assert_eq!(categories[0].display_name, "测试类别");
    }

    #[test]
    fn test_tool_enable_disable() {
        let mut config_manager = ToolConfigManager::default();

        let tool_config = ToolConfig {
            name: "toggle_tool".to_string(),
            display_name: "可切换工具".to_string(),
            description: "用于测试启用/禁用功能".to_string(),
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

        // 初始状态应该是启用的
        assert!(config_manager.is_tool_enabled("toggle_tool"));

        // 禁用工具
        config_manager.disable_tool("toggle_tool").unwrap();
        assert!(!config_manager.is_tool_enabled("toggle_tool"));

        // 重新启用工具
        config_manager.enable_tool("toggle_tool").unwrap();
        assert!(config_manager.is_tool_enabled("toggle_tool"));
    }

    #[test]
    fn test_category_enable_disable() {
        let mut config_manager = ToolConfigManager::default();

        let category = ToolCategory {
            id: "toggle_category".to_string(),
            name: "toggle_category".to_string(),
            display_name: "可切换类别".to_string(),
            description: "用于测试类别启用/禁用".to_string(),
            icon: "🔧".to_string(),
            enabled: true,
            strict_tools_mode: false,
        };

        config_manager.set_custom_categories(vec![category]);

        // 初始状态应该是启用的
        assert_eq!(config_manager.get_enabled_categories_count(), 1);

        // 禁用类别
        config_manager.disable_category("toggle_category").unwrap();
        assert_eq!(config_manager.get_enabled_categories_count(), 0);

        // 重新启用类别
        config_manager.enable_category("toggle_category").unwrap();
        assert_eq!(config_manager.get_enabled_categories_count(), 1);
    }

    #[test]
    fn test_config_update() {
        let mut config_manager = ToolConfigManager::default();

        let original_config = ToolConfig {
            name: "update_tool".to_string(),
            display_name: "原始工具".to_string(),
            description: "原始描述".to_string(),
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
            display_name: "更新后的工具".to_string(),
            description: "更新后的描述".to_string(),
            category_id: "updated".to_string(),
            enabled: false,
            requires_approval: true,
            auto_prefix: Some("/updated".to_string()),
            permissions: vec!["write".to_string()],
            tool_type: "RegexParameterExtraction".to_string(),
            parameter_regex: Some(r"test_(\w+)".to_string()),
            custom_prompt: Some("更新的提示".to_string()),
        };

        config_manager
            .update_tool_config("update_tool", updated_config)
            .unwrap();

        let retrieved_config = config_manager.get_tool_config("update_tool").unwrap();
        assert_eq!(retrieved_config.display_name, "更新后的工具");
        assert_eq!(retrieved_config.description, "更新后的描述");
        assert_eq!(retrieved_config.category_id, "updated");
        assert!(!retrieved_config.enabled);
        assert!(retrieved_config.requires_approval);
    }

    #[test]
    fn test_tools_by_category() {
        let mut config_manager = ToolConfigManager::default();

        let tool1 = ToolConfig {
            name: "cat1_tool1".to_string(),
            display_name: "类别1工具1".to_string(),
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
            display_name: "类别1工具2".to_string(),
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
            display_name: "类别2工具1".to_string(),
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
            display_name: "建造者工具".to_string(),
            description: "通过建造者模式创建".to_string(),
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
            display_name: "建造者类别".to_string(),
            description: "通过建造者模式创建的类别".to_string(),
            icon: "🔧".to_string(),
            enabled: true,
            strict_tools_mode: false,
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
            display_name: "安全工具".to_string(),
            description: "需要审批和权限的工具".to_string(),
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
            display_name: "显示工具".to_string(),
            description: "测试显示名称".to_string(),
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
            display_name: "显示类别".to_string(),
            description: "测试类别显示名称".to_string(),
            icon: "🔧".to_string(),
            enabled: true,
            strict_tools_mode: false,
        };

        config_manager.register_tool_config(tool_config);
        config_manager.set_custom_categories(vec![category]);

        assert_eq!(
            config_manager
                .get_tool_display_name("display_tool")
                .unwrap(),
            "显示工具"
        );
        assert_eq!(
            config_manager
                .get_category_display_name("display_category")
                .unwrap(),
            "显示类别"
        );

        // 测试不存在的项目
        assert!(config_manager
            .get_tool_display_name("nonexistent")
            .is_none());
        assert!(config_manager
            .get_category_display_name("nonexistent")
            .is_none());
    }
}
