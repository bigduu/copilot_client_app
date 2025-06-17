//! 严格工具模式功能验证示例
//!
//! 这个文件展示了如何使用新的 strict_tools_mode 功能

#[cfg(test)]
mod tests {
    use crate::tools::categories::*;
    use crate::tools::category::Category;
    use crate::tools::tool_manager::ToolManagerBuilder;

    #[test]
    fn demo_strict_tools_mode_usage() {
        println!("=== 严格工具模式功能演示 ===");

        // 创建各个类别
        let file_ops = FileOperationsCategory::new();
        let cmd_exec = CommandExecutionCategory::new();
        let general = GeneralAssistantCategory::new();

        // 显示各类别的严格模式设置
        println!("文件操作类别 - 严格模式: {}", file_ops.strict_tools_mode());
        println!("命令执行类别 - 严格模式: {}", cmd_exec.strict_tools_mode());
        println!("通用助手类别 - 严格模式: {}", general.strict_tools_mode());

        // 构建完整的工具管理器
        let builder = ToolManagerBuilder::new()
            .add_category(file_ops)
            .add_category(cmd_exec)
            .add_category(general);

        let manager = builder.build();

        // 获取启用的类别
        let categories = manager.get_enabled_categories();
        println!("启用的类别数量: {}", categories.len());

        // 验证严格模式设置
        for category in &categories {
            println!(
                "类别 {} - 严格模式: {}",
                category.display_name, category.strict_tools_mode
            );
        }

        // 验证预期的严格模式设置
        let file_category = categories
            .iter()
            .find(|c| c.id == "file_operations")
            .unwrap();
        let cmd_category = categories
            .iter()
            .find(|c| c.id == "command_execution")
            .unwrap();
        let general_category = categories
            .iter()
            .find(|c| c.id == "general_assistant")
            .unwrap();

        assert!(
            !file_category.strict_tools_mode,
            "文件操作应该不使用严格模式"
        );
        assert!(cmd_category.strict_tools_mode, "命令执行应该使用严格模式");
        assert!(
            !general_category.strict_tools_mode,
            "通用助手应该不使用严格模式"
        );

        println!("=== 严格工具模式验证通过 ===");
    }

    #[test]
    fn test_strict_mode_configuration() {
        // 测试各类别的严格模式配置
        let file_ops = FileOperationsCategory::new();
        let cmd_exec = CommandExecutionCategory::new();
        let general = GeneralAssistantCategory::new();

        // 验证默认配置
        assert!(!file_ops.strict_tools_mode());
        assert!(cmd_exec.strict_tools_mode());
        assert!(!general.strict_tools_mode());

        // 验证类别信息中的严格模式设置
        let file_info = file_ops.build_info();
        let cmd_info = cmd_exec.build_info();
        let general_info = general.build_info();

        assert!(!file_info.category.strict_tools_mode);
        assert!(cmd_info.category.strict_tools_mode);
        assert!(!general_info.category.strict_tools_mode);
    }

    #[test]
    fn test_strict_mode_in_manager() {
        // 创建工具管理器并测试严格模式
        let manager = ToolManagerBuilder::new()
            .add_category(FileOperationsCategory::new())
            .add_category(CommandExecutionCategory::new())
            .add_category(GeneralAssistantCategory::new())
            .build();

        let categories = manager.get_enabled_categories();
        assert_eq!(categories.len(), 3);

        // 检查严格模式设置是否正确传递
        let strict_categories: Vec<_> = categories.iter().filter(|c| c.strict_tools_mode).collect();
        let non_strict_categories: Vec<_> =
            categories.iter().filter(|c| !c.strict_tools_mode).collect();

        assert_eq!(strict_categories.len(), 1, "应该只有一个严格模式类别");
        assert_eq!(non_strict_categories.len(), 2, "应该有两个非严格模式类别");

        // 验证命令执行是严格模式
        assert!(strict_categories[0].id == "command_execution");
    }
}
