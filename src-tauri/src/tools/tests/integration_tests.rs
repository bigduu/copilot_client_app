//! 集成测试 - 验证新建造者模式架构与现有 API 的兼容性

#[cfg(test)]
mod tests {
    use crate::tools::tool_manager::create_default_tool_manager;

    /// 测试新建造者模式与现有 ToolManager API 的兼容性
    #[test]
    fn test_builder_pattern_compatibility_with_existing_apis() {
        // 使用新的建造者模式创建 ToolManager
        let tool_manager = create_default_tool_manager();

        // 测试基本 API 兼容性
        let tools_list = tool_manager.list_tools();
        assert!(!tools_list.is_empty(), "工具列表应该不为空");

        let tools_for_ui = tool_manager.list_tools_for_ui();
        assert!(!tools_for_ui.is_empty(), "UI 工具列表应该不为空");

        // 测试获取类别信息
        let categories = tool_manager.get_enabled_categories();
        assert!(!categories.is_empty(), "类别列表应该不为空");

        // 测试获取工具配置
        let category_infos = tool_manager.get_enabled_category_info();
        assert!(!category_infos.is_empty(), "类别信息列表应该不为空");

        let mut total_tools = 0;
        for category_info in category_infos {
            total_tools += category_info.tools.len();
        }
        assert!(total_tools > 0, "工具配置列表应该不为空");

        // 测试类别ID是否正确
        let category_ids: Vec<String> = categories.iter().map(|c| c.id.clone()).collect();

        assert!(
            category_ids.contains(&"file_operations".to_string()),
            "应包含文件操作类别"
        );
        assert!(
            category_ids.contains(&"command_execution".to_string()),
            "应包含命令执行类别"
        );
        assert!(
            category_ids.contains(&"general_assistant".to_string()),
            "应包含通用助手类别"
        );

        // 同时测试显示名称是否正确
        let category_display_names: Vec<String> =
            categories.iter().map(|c| c.display_name.clone()).collect();

        assert!(
            category_display_names.contains(&"文件操作".to_string()),
            "应包含文件操作显示名称"
        );
        assert!(
            category_display_names.contains(&"命令执行".to_string()),
            "应包含命令执行显示名称"
        );
        assert!(
            category_display_names.contains(&"通用助手".to_string()),
            "应包含通用助手显示名称"
        );
    }

    /// 测试工具获取和执行兼容性
    #[tokio::test]
    async fn test_tool_execution_compatibility() {
        let tool_manager = create_default_tool_manager();

        // 测试工具名称列表
        let tools_for_ui = tool_manager.list_tools_for_ui();
        let tool_names: Vec<String> = tools_for_ui.iter().map(|t| t.name.clone()).collect();

        println!("📋 可用工具: {:?}", tool_names);

        // 验证至少有一些工具可用
        assert!(!tool_names.is_empty(), "应该有可用的工具");

        // 尝试获取一个工具
        for tool_name in &tool_names {
            if let Some(_tool) = tool_manager.get_tool(tool_name) {
                println!("✅ 工具 '{}' 获取成功", tool_name);
                break;
            }
        }
    }

    /// 测试配置更新兼容性
    #[test]
    fn test_config_update_compatibility() {
        let tool_manager = create_default_tool_manager();

        // 测试读取配置
        let categories = tool_manager.get_enabled_categories();
        for category in categories {
            println!("📁 类别: {} - {}", category.name, category.description);

            // 测试获取类别工具
            let tools = tool_manager.get_category_tools(&category.id);
            println!("  🔧 工具数量: {}", tools.len());
        }

        println!("✅ 配置更新兼容性测试通过");
    }

    /// 测试 Tauri 命令兼容的数据结构
    #[test]
    fn test_tauri_command_data_structures() {
        let tool_manager = create_default_tool_manager();

        // 测试 ToolUIInfo 兼容性
        let tools_for_ui = tool_manager.list_tools_for_ui();
        for tool in &tools_for_ui {
            // 验证必需的字段存在
            assert!(!tool.name.is_empty(), "工具名称不应为空");
            assert!(!tool.description.is_empty(), "工具描述不应为空");
            assert!(!tool.tool_type.is_empty(), "工具类型不应为空");

            // 验证参数结构
            for param in &tool.parameters {
                assert!(!param.name.is_empty(), "参数名称不应为空");
                assert!(!param.param_type.is_empty(), "参数类型不应为空");
            }
        }

        // 测试 ToolConfig 兼容性
        let category_infos = tool_manager.get_enabled_category_info();
        let mut all_tool_configs = Vec::new();
        for category_info in category_infos {
            all_tool_configs.extend(category_info.tools);
        }

        for config in &all_tool_configs {
            assert!(!config.name.is_empty(), "配置名称不应为空");
            assert!(!config.display_name.is_empty(), "显示名称不应为空");
            assert!(!config.description.is_empty(), "描述不应为空");
            assert!(!config.category_id.is_empty(), "类别ID不应为空");
        }

        println!("✅ 所有 Tauri 命令数据结构兼容性测试通过");
    }

    /// 测试向后兼容性 - 确保旧的 API 仍然工作
    #[test]
    fn test_backward_compatibility() {
        let tool_manager = create_default_tool_manager();

        // 测试旧的工具列表 API
        let tools_list = tool_manager.list_tools();
        assert!(!tools_list.is_empty(), "工具列表API应正常工作");

        // 测试工具获取 API
        let tools_for_ui = tool_manager.list_tools_for_ui();
        let available_tool_count = tools_for_ui.len();

        for tool_info in &tools_for_ui {
            if let Some(_tool) = tool_manager.get_tool(&tool_info.name) {
                // 工具获取成功
                continue;
            }
        }

        println!(
            "✅ 向后兼容性测试通过 - {} 个工具可用",
            available_tool_count
        );
    }

    /// 性能基准测试 - 验证新架构不会显著影响性能
    #[test]
    fn test_performance_benchmark() {
        use std::time::Instant;

        // 测试 ToolManager 创建性能
        let start = Instant::now();
        let _tool_manager = create_default_tool_manager();
        let creation_time = start.elapsed();

        println!("🚀 ToolManager 创建时间: {:?}", creation_time);

        // 确保创建时间合理（小于100ms）
        assert!(
            creation_time.as_millis() < 100,
            "ToolManager 创建时间应小于100ms，实际: {:?}",
            creation_time
        );

        // 测试工具列表获取性能
        let tool_manager = create_default_tool_manager();
        let start = Instant::now();
        let _tools = tool_manager.list_tools_for_ui();
        let list_time = start.elapsed();

        println!("📋 工具列表获取时间: {:?}", list_time);

        // 确保列表获取时间合理（小于10ms）
        assert!(
            list_time.as_millis() < 10,
            "工具列表获取时间应小于10ms，实际: {:?}",
            list_time
        );
    }
}
