//! 严格工具模式功能验证示例
//!
//! 这个文件展示了如何使用新的 strict_tools_mode 功能

#[cfg(test)]
mod tests {
    use crate::tools::categories::*;

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
            .register_category(file_ops)
            .register_category(cmd_exec)
            .register_category(general);

        let (categories, _tool_configs) = builder.build_with_categories();

        println!("\n=== 构建后的类别信息 ===");
        for category in &categories {
            println!(
                "类别: {} ({}), 严格模式: {}, 启用: {}",
                category.name, category.id, category.strict_tools_mode, category.enabled
            );
        }

        // 验证命令执行类别确实启用了严格模式
        let cmd_category = categories
            .iter()
            .find(|c| c.id == "command_execution")
            .expect("应该找到命令执行类别");

        assert!(
            cmd_category.strict_tools_mode,
            "命令执行类别应该启用严格模式"
        );

        // 验证其他类别没有启用严格模式
        let file_category = categories
            .iter()
            .find(|c| c.id == "file_operations")
            .expect("应该找到文件操作类别");

        assert!(
            !file_category.strict_tools_mode,
            "文件操作类别不应该启用严格模式"
        );

        println!("\n✅ 严格工具模式功能验证成功！");
    }

    #[test]
    fn demo_new_tool_category_strict_mode() {
        use crate::tools::types::ToolCategory;

        println!("=== ToolCategory 严格模式演示 ===");

        // 创建一个自定义类别并设置严格模式
        let custom_category = ToolCategory::new(
            "custom_ai".to_string(),
            "AI助手".to_string(),
            "专门用于AI对话的类别".to_string(),
            "🤖".to_string(),
        )
        .with_strict_tools_mode(true)
        .with_enabled(true);

        println!("自定义类别: {}", custom_category.display_name);
        println!("严格模式: {}", custom_category.strict_tools_mode);
        println!("启用状态: {}", custom_category.enabled);

        assert!(custom_category.strict_tools_mode);
        assert!(custom_category.enabled);

        println!("✅ ToolCategory 严格模式设置成功！");
    }
}
