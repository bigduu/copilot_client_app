//! API 接口测试
//!
//! 验证更新后的 Tauri 命令是否正确使用新架构

use crate::tools::categories::{
    CommandExecutionCategory, FileOperationsCategory, GeneralAssistantCategory,
};
use crate::tools::tool_manager::ToolManager;
use std::sync::Arc;

#[cfg(test)]
mod tests {
    use super::*;

    /// 创建测试用的工具管理器
    fn create_test_tool_manager() -> Arc<ToolManager> {
        let categories: Vec<Box<dyn crate::tools::category::Category>> = vec![
            Box::new(FileOperationsCategory::new()),
            Box::new(CommandExecutionCategory::new()),
            Box::new(GeneralAssistantCategory::new()),
        ];

        Arc::new(ToolManager::new(categories))
    }

    #[test]
    fn test_get_enabled_categories_with_system_prompt() {
        let tool_manager = create_test_tool_manager();

        // 获取启用的类别
        let categories = tool_manager.get_enabled_categories();

        // 验证返回的类别包含 system_prompt 字段
        assert!(!categories.is_empty(), "应该有启用的类别");

        for category in &categories {
            // 验证每个类别都有必要的字段
            assert!(!category.id.is_empty(), "类别ID不应为空");
            assert!(!category.name.is_empty(), "类别名称不应为空");
            assert!(!category.display_name.is_empty(), "类别显示名称不应为空");
            assert!(!category.description.is_empty(), "类别描述不应为空");
            // system_prompt 字段可以为空，但应该存在
            // 这个字段在新架构中被正确包含
        }

        println!("获取到 {} 个启用的类别", categories.len());
        for category in &categories {
            println!(
                "类别: {} ({}), system_prompt长度: {}",
                category.display_name,
                category.id,
                category.system_prompt.len()
            );
        }
    }

    #[test]
    fn test_get_category_tools_functionality() {
        let tool_manager = create_test_tool_manager();

        // 获取文件操作类别的工具
        let file_tools = tool_manager.get_category_tools("file_operations");
        assert!(!file_tools.is_empty(), "文件操作类别应该有工具");

        // 验证工具配置的完整性
        for tool in &file_tools {
            assert!(!tool.name.is_empty(), "工具名称不应为空");
            assert!(!tool.display_name.is_empty(), "工具显示名称不应为空");
            assert!(!tool.description.is_empty(), "工具描述不应为空");
            assert_eq!(tool.category_id, "file_operations", "工具应属于正确的类别");
        }

        println!("文件操作类别包含 {} 个工具", file_tools.len());
    }

    #[test]
    fn test_get_category_by_id() {
        let tool_manager = create_test_tool_manager();

        // 测试获取特定类别
        let category = tool_manager.get_category_by_id("file_operations");
        assert!(category.is_some(), "应该能找到文件操作类别");

        let category = category.unwrap();
        assert_eq!(category.id, "file_operations");
        assert_eq!(category.name, "file_operations");
        assert!(category.enabled, "类别应该是启用的");

        // 测试不存在的类别
        let non_existent = tool_manager.get_category_by_id("non_existent_category");
        assert!(non_existent.is_none(), "不存在的类别应该返回 None");
    }

    #[test]
    fn test_tool_manager_stats() {
        let tool_manager = create_test_tool_manager();

        // 验证统计信息
        let category_count = tool_manager.category_count();
        let enabled_category_count = tool_manager.enabled_category_count();
        let tool_count = tool_manager.tool_count();

        assert!(category_count > 0, "应该有类别");
        assert!(enabled_category_count > 0, "应该有启用的类别");
        assert!(tool_count > 0, "应该有工具");
        assert!(
            enabled_category_count <= category_count,
            "启用的类别不应超过总类别数"
        );

        println!(
            "统计信息 - 总类别: {}, 启用类别: {}, 总工具: {}",
            category_count, enabled_category_count, tool_count
        );
    }

    #[test]
    fn test_priority_sorting() {
        let tool_manager = create_test_tool_manager();

        // 获取类别信息（应该按优先级排序）
        let category_infos = tool_manager.get_all_category_info();

        assert!(!category_infos.is_empty(), "应该有类别信息");

        // 验证优先级排序（高优先级在前）
        for i in 1..category_infos.len() {
            assert!(
                category_infos[i - 1].priority >= category_infos[i].priority,
                "类别应该按优先级降序排列"
            );
        }

        println!("类别优先级排序验证通过");
        for info in &category_infos {
            println!(
                "类别: {} - 优先级: {}",
                info.category.display_name, info.priority
            );
        }
    }

    #[test]
    fn test_backward_compatibility_data_structures() {
        let tool_manager = create_test_tool_manager();

        // 验证向后兼容性 - 确保数据结构符合前端期望
        let categories = tool_manager.get_enabled_categories();

        for category in &categories {
            // 验证前端需要的所有字段都存在
            assert!(!category.id.is_empty());
            assert!(!category.name.is_empty());
            assert!(!category.display_name.is_empty());
            assert!(!category.description.is_empty());
            assert!(!category.icon.is_empty());

            // 新添加的字段
            // system_prompt 字段应该存在（可以为空）
            // strict_tools_mode 字段应该存在

            // 验证工具配置
            let tools = tool_manager.get_category_tools(&category.id);
            for tool in &tools {
                assert!(!tool.name.is_empty());
                assert!(!tool.display_name.is_empty());
                assert!(!tool.description.is_empty());
                assert_eq!(tool.category_id, category.id);
            }
        }

        println!("向后兼容性验证通过");
    }
}
