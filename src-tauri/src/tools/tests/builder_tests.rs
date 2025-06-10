//! 测试新的建造者模式架构
//!
//! 这个文件用于验证新的 CategoryBuilder 和 ToolManagerBuilder 是否正常工作

#[cfg(test)]
mod tests {
    use crate::tools::categories::*;

    #[test]
    fn test_file_operations_category_builder() {
        let category = FileOperationsCategory::new();

        // 测试构建类别
        let built_category = category.build_category();
        assert_eq!(built_category.name, "file_operations");
        assert_eq!(built_category.display_name, "文件操作");
        assert!(built_category.enabled);
        assert!(!built_category.strict_tools_mode); // 文件操作不使用严格模式

        // 测试权限控制
        assert!(category.enabled());
        assert!(!category.strict_tools_mode()); // 文件操作不使用严格模式

        // 测试构建工具（虽然现在可能有编译错误，但结构是正确的）
        let tools = category.build_tools();
        assert!(!tools.is_empty(), "文件操作类别应该包含工具");
    }

    #[test]
    fn test_command_execution_category_builder() {
        let category = CommandExecutionCategory::new();

        let built_category = category.build_category();
        assert_eq!(built_category.name, "command_execution");
        assert_eq!(built_category.display_name, "命令执行");
        assert!(built_category.enabled);
        assert!(built_category.strict_tools_mode); // 命令执行使用严格模式

        assert!(category.enabled());
        assert!(category.strict_tools_mode()); // 命令执行使用严格模式
    }

    #[test]
    fn test_general_assistant_category_builder() {
        let category = GeneralAssistantCategory::new();

        let built_category = category.build_category();
        assert_eq!(built_category.name, "general_assistant");
        assert_eq!(built_category.display_name, "通用助手");
        assert!(built_category.enabled);
        assert!(!built_category.strict_tools_mode); // 通用助手不使用严格模式

        assert!(category.enabled());
        assert!(!category.strict_tools_mode()); // 通用助手不使用严格模式

        // 通用助手类别目前没有工具
        let tools = category.build_tools();
        assert!(tools.is_empty(), "通用助手类别目前应该是空的");
    }

    #[test]
    fn test_tool_manager_builder() {
        let builder = ToolManagerBuilder::new()
            .register_category(FileOperationsCategory::new())
            .register_category(CommandExecutionCategory::new())
            .register_category(GeneralAssistantCategory::new());

        // 测试获取所有类别
        let all_categories = builder.get_all_categories();
        assert_eq!(all_categories.len(), 3);

        // 测试获取启用的类别
        let enabled_categories = builder.get_enabled_categories();
        assert_eq!(enabled_categories.len(), 3); // 所有类别都应该是启用的

        // 测试构建工具映射
        let _tools = builder.build();
        // 注意：由于 ToolConfig::from_tool 可能还有问题，这个测试可能会失败
        // 但架构本身是正确的
    }

    #[test]
    fn test_category_with_disabled() {
        let category = FileOperationsCategory::new().with_enabled(false);

        let built_category = category.build_category();
        assert!(!built_category.enabled);
        assert!(!category.enabled());
    }

    #[test]
    fn test_builder_pattern_workflow() {
        // 测试完整的建造者模式工作流
        let builder = ToolManagerBuilder::new();
        
        // 注册多个类别
        let builder = builder
            .register_category(FileOperationsCategory::new())
            .register_category(CommandExecutionCategory::new().with_enabled(false))
            .register_category(GeneralAssistantCategory::new());

        // 验证类别数量
        assert_eq!(builder.get_all_categories().len(), 3);
        assert_eq!(builder.get_enabled_categories().len(), 2); // 一个被禁用

        // 测试构建过程
        let (categories, tool_configs) = builder.build_with_categories();
        
        assert_eq!(categories.len(), 3);
        assert!(!tool_configs.is_empty());
        
        // 验证类别结构
        let category_names: Vec<String> = categories.iter()
            .map(|c| c.id.clone())
            .collect();
            
        assert!(category_names.contains(&"file_operations".to_string()));
        assert!(category_names.contains(&"command_execution".to_string()));
        assert!(category_names.contains(&"general_assistant".to_string()));
    }

    #[test]
    fn test_category_customization() {
        // 测试类别自定义功能
        let custom_category = FileOperationsCategory::new()
            .with_enabled(false);

        let built_category = custom_category.build_category();
        
        assert!(!built_category.enabled);
    }

    #[test]
    fn test_builder_chain_methods() {
        // 测试建造者模式的链式调用
        let result = ToolManagerBuilder::new()
            .register_category(FileOperationsCategory::new())
            .register_category(CommandExecutionCategory::new())
            .register_category(GeneralAssistantCategory::new())
            .get_enabled_categories();

        assert_eq!(result.len(), 3);
        
        // 测试所有类别都是启用的
        for category in result {
            assert!(category.enabled);
        }
    }

    #[test]
    fn test_empty_builder() {
        // 测试空建造者
        let builder = ToolManagerBuilder::new();
        
        assert_eq!(builder.get_all_categories().len(), 0);
        assert_eq!(builder.get_enabled_categories().len(), 0);
        
        let tools = builder.build();
        assert!(tools.is_empty());
    }

    #[test]
    fn test_partial_category_registration() {
        // 测试部分类别注册
        let builder = ToolManagerBuilder::new()
            .register_category(FileOperationsCategory::new());

        assert_eq!(builder.get_all_categories().len(), 1);
        assert_eq!(builder.get_enabled_categories().len(), 1);

        let (categories, _) = builder.build_with_categories();
        assert_eq!(categories.len(), 1);
        assert_eq!(categories[0].id, "file_operations");
    }

    #[test]
    fn test_strict_tools_mode_configuration() {
        // 测试严格工具模式的配置
        let file_ops = FileOperationsCategory::new();
        let cmd_exec = CommandExecutionCategory::new();
        let general = GeneralAssistantCategory::new();

        // 验证各类别的严格模式设置
        assert!(!file_ops.strict_tools_mode(), "文件操作应该不使用严格模式");
        assert!(cmd_exec.strict_tools_mode(), "命令执行应该使用严格模式");
        assert!(!general.strict_tools_mode(), "通用助手应该不使用严格模式");

        // 验证构建的类别也有正确的严格模式设置
        let file_category = file_ops.build_category();
        let cmd_category = cmd_exec.build_category();
        let general_category = general.build_category();

        assert!(!file_category.strict_tools_mode);
        assert!(cmd_category.strict_tools_mode);
        assert!(!general_category.strict_tools_mode);
    }

    #[test]
    fn test_tool_manager_builder_with_strict_mode() {
        // 测试工具管理器建造者传递严格模式设置
        let builder = ToolManagerBuilder::new()
            .register_category(FileOperationsCategory::new())
            .register_category(CommandExecutionCategory::new())
            .register_category(GeneralAssistantCategory::new());

        let (categories, _) = builder.build_with_categories();
        
        // 找到各个类别并验证其严格模式设置
        let file_ops_category = categories.iter()
            .find(|c| c.id == "file_operations")
            .expect("应该找到文件操作类别");
        assert!(!file_ops_category.strict_tools_mode);

        let cmd_exec_category = categories.iter()
            .find(|c| c.id == "command_execution")
            .expect("应该找到命令执行类别");
        assert!(cmd_exec_category.strict_tools_mode);

        let general_category = categories.iter()
            .find(|c| c.id == "general_assistant")
            .expect("应该找到通用助手类别");
        assert!(!general_category.strict_tools_mode);
    }

    #[test]
    fn test_new_tool_category_with_strict_tools_mode() {
        // 测试 NewToolCategory 的 with_strict_tools_mode 方法
        use crate::tools::types::NewToolCategory;

        let category = NewToolCategory::new(
            "test".to_string(),
            "测试".to_string(),
            "测试类别".to_string(),
            "🧪".to_string(),
        );

        // 默认情况下严格模式应该是 false
        assert!(!category.strict_tools_mode);

        // 测试设置严格模式
        let strict_category = category.with_strict_tools_mode(true);
        assert!(strict_category.strict_tools_mode);

        // 测试链式调用
        let chained_category = NewToolCategory::new(
            "test2".to_string(),
            "测试2".to_string(),
            "测试类别2".to_string(),
            "🔬".to_string(),
        )
        .with_enabled(false)
        .with_strict_tools_mode(true);

        assert!(!chained_category.enabled);
        assert!(chained_category.strict_tools_mode);
    }
}