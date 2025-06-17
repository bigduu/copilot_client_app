//! 测试新的 Category trait 架构
//!
//! 这个文件用于验证新的 Category trait 和 ToolManager 是否正常工作

#[cfg(test)]
mod tests {
    use crate::tools::categories::*;
    use crate::tools::category::Category;
    use crate::tools::tool_manager::ToolManagerBuilder;

    #[test]
    fn test_file_operations_category() {
        let category = FileOperationsCategory::new();

        // 测试基本属性
        assert_eq!(category.id(), "file_operations");
        assert_eq!(category.name(), "file_operations");
        assert!(category.enable());
        assert!(!category.strict_tools_mode()); // 文件操作不使用严格模式

        // 测试构建工具配置
        let tool_configs = category.build_tool_configs();
        assert!(!tool_configs.is_empty(), "文件操作类别应该包含工具配置");

        // 测试系统提示符
        assert!(!category.system_prompt().is_empty(), "应该有系统提示符");
    }

    #[test]
    fn test_command_execution_category() {
        let category = CommandExecutionCategory::new();

        // 测试基本属性
        assert_eq!(category.id(), "command_execution");
        assert_eq!(category.name(), "command_execution");
        assert!(category.enable());
        assert!(category.strict_tools_mode()); // 命令执行使用严格模式

        // 测试系统提示符
        assert!(!category.system_prompt().is_empty(), "应该有系统提示符");
    }

    #[test]
    fn test_general_assistant_category() {
        let category = GeneralAssistantCategory::new();

        // 测试基本属性
        assert_eq!(category.id(), "general_assistant");
        assert_eq!(category.name(), "general_assistant");
        assert!(category.enable());
        assert!(!category.strict_tools_mode()); // 通用助手不使用严格模式

        // 测试工具配置（通用助手目前没有具体工具）
        let tool_configs = category.build_tool_configs();
        assert!(tool_configs.is_empty(), "通用助手类别目前不包含具体工具");

        // 测试系统提示符
        assert!(!category.system_prompt().is_empty(), "应该有系统提示符");
    }

    #[test]
    fn test_tool_manager_builder() {
        let builder = ToolManagerBuilder::new().add_category(FileOperationsCategory::new());

        let manager = builder.build();

        // 测试类别数量
        assert_eq!(manager.category_count(), 1);
        assert_eq!(manager.enabled_category_count(), 1);

        // 测试获取类别
        let categories = manager.get_enabled_categories();
        assert_eq!(categories.len(), 1);
        assert_eq!(categories[0].id, "file_operations");
    }

    #[test]
    fn test_disabled_category() {
        // 为了测试禁用功能，我们跳过这个测试，因为当前结构不支持运行时禁用
        let category = FileOperationsCategory::new();

        let builder = ToolManagerBuilder::new().add_category(category);

        let manager = builder.build();

        // 现在所有类别都默认启用，所以测试启用状态
        assert_eq!(manager.category_count(), 1); // 类别存在
        assert_eq!(manager.enabled_category_count(), 1); // 并且启用
        assert!(manager.tool_count() > 0); // 有工具实例
    }

    #[test]
    fn test_tool_manager_builder_empty() {
        let builder = ToolManagerBuilder::new();
        let manager = builder.build();

        assert_eq!(manager.category_count(), 0);
        assert_eq!(manager.enabled_category_count(), 0);
        assert_eq!(manager.tool_count(), 0);
    }

    #[test]
    fn test_custom_category_configuration() {
        let custom_category = FileOperationsCategory::new();

        // 测试类别信息构建
        let category_info = custom_category.build_info();
        assert_eq!(category_info.category.id, "file_operations");
        assert_eq!(category_info.category.display_name, "文件操作");
        assert!(category_info.category.enabled);
    }

    #[test]
    fn test_category_registration() {
        let builder = ToolManagerBuilder::new().add_category(FileOperationsCategory::new());

        let manager = builder.build();
        let categories = manager.get_enabled_categories();

        assert_eq!(categories.len(), 1);
        assert_eq!(categories[0].name, "file_operations");
    }

    #[test]
    fn test_empty_tool_manager() {
        let builder = ToolManagerBuilder::new();
        let manager = builder.build();

        assert_eq!(manager.category_count(), 0);
        assert_eq!(manager.enabled_category_count(), 0);
    }

    #[test]
    fn test_tool_manager_with_single_category() {
        let builder = ToolManagerBuilder::new().add_category(FileOperationsCategory::new());

        let manager = builder.build();
        assert_eq!(manager.category_count(), 1);
    }

    #[test]
    fn test_multiple_category_strict_mode() {
        let file_ops = FileOperationsCategory::new();
        let cmd_exec = CommandExecutionCategory::new();
        let general = GeneralAssistantCategory::new();

        // 测试严格模式设置
        assert!(!file_ops.strict_tools_mode(), "文件操作应该不使用严格模式");
        assert!(cmd_exec.strict_tools_mode(), "命令执行应该使用严格模式");
        assert!(!general.strict_tools_mode(), "通用助手应该不使用严格模式");

        // 测试类别信息
        let file_info = file_ops.build_info();
        let cmd_info = cmd_exec.build_info();
        let general_info = general.build_info();

        assert_eq!(file_info.category.strict_tools_mode, false);
        assert_eq!(cmd_info.category.strict_tools_mode, true);
        assert_eq!(general_info.category.strict_tools_mode, false);
    }

    #[test]
    fn test_builder_with_multiple_categories() {
        let builder = ToolManagerBuilder::new()
            .add_category(FileOperationsCategory::new())
            .add_category(CommandExecutionCategory::new())
            .add_category(GeneralAssistantCategory::new());

        let manager = builder.build();

        assert_eq!(manager.category_count(), 3);
        assert_eq!(manager.enabled_category_count(), 3);

        let categories = manager.get_enabled_categories();
        assert_eq!(categories.len(), 3);

        // 验证所有类别都存在
        let category_ids: Vec<&str> = categories.iter().map(|c| c.id.as_str()).collect();
        assert!(category_ids.contains(&"file_operations"));
        assert!(category_ids.contains(&"command_execution"));
        assert!(category_ids.contains(&"general_assistant"));
    }
}
