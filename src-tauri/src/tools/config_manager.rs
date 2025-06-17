//! 工具配置管理器
//!
//! 提供工具和类别配置的管理功能

use crate::tools::types::{ToolCategory, ToolConfig};
use std::collections::HashMap;

/// 工具配置管理器
#[derive(Debug, Default)]
pub struct ToolConfigManager {
    tool_configs: HashMap<String, ToolConfig>,
    categories: Vec<ToolCategory>,
}

impl ToolConfigManager {
    /// 创建新的配置管理器
    pub fn new(config_dir: std::path::PathBuf) -> Self {
        // 这里保持简单实现，实际的配置加载逻辑已移至建造者模式
        let _ = config_dir; // 暂时忽略配置目录参数
        Self::default()
    }

    /// 注册工具配置
    pub fn register_tool_config(&mut self, config: ToolConfig) {
        self.tool_configs.insert(config.name.clone(), config);
    }

    /// 检查工具是否启用
    pub fn is_tool_enabled(&self, tool_name: &str) -> bool {
        self.tool_configs
            .get(tool_name)
            .map(|config| config.enabled)
            .unwrap_or(true)
    }

    /// 获取工具配置
    pub fn get_tool_config(&self, tool_name: &str) -> Option<&ToolConfig> {
        self.tool_configs.get(tool_name)
    }

    /// 设置自定义类别
    pub fn set_custom_categories(&mut self, categories: Vec<ToolCategory>) {
        self.categories = categories;
    }

    /// 获取所有类别
    pub fn get_categories(&self) -> &Vec<ToolCategory> {
        &self.categories
    }

    /// 获取所有工具配置
    pub fn get_all_tool_configs(&self) -> &HashMap<String, ToolConfig> {
        &self.tool_configs
    }

    /// 获取可用工具列表
    pub fn get_available_tools(&self) -> Vec<ToolConfig> {
        self.tool_configs.values().cloned().collect()
    }

    /// 更新工具配置
    pub fn update_tool_config(
        &mut self,
        tool_name: &str,
        config: ToolConfig,
    ) -> Result<(), String> {
        if self.tool_configs.contains_key(tool_name) {
            self.tool_configs.insert(tool_name.to_string(), config);
            Ok(())
        } else {
            Err(format!("Tool '{}' not found", tool_name))
        }
    }

    /// 更新类别配置
    pub fn update_category_config(
        &mut self,
        category_id: &str,
        category: ToolCategory,
    ) -> Result<(), String> {
        if let Some(existing_category) = self.categories.iter_mut().find(|c| c.id == category_id) {
            *existing_category = category;
            Ok(())
        } else {
            Err(format!("Category '{}' not found", category_id))
        }
    }

    /// 将工具注册到类别
    pub fn register_tool_to_category(
        &mut self,
        tool_name: &str,
        category_id: &str,
    ) -> Result<(), String> {
        if let Some(tool_config) = self.tool_configs.get_mut(tool_name) {
            tool_config.category_id = category_id.to_string();
            Ok(())
        } else {
            Err(format!("Tool '{}' not found", tool_name))
        }
    }

    /// 重置到默认配置
    pub fn reset_to_defaults(&mut self) {
        self.tool_configs.clear();
        self.categories.clear();
    }

    /// 导入配置
    pub fn import_configs(&mut self, json_content: &str) -> Result<(), String> {
        // 简化实现，实际应该解析JSON并更新配置
        let _ = json_content;
        Ok(())
    }

    /// 导出配置
    pub fn export_configs(&self) -> Result<String, String> {
        match serde_json::to_string_pretty(&self.tool_configs) {
            Ok(json) => Ok(json),
            Err(e) => Err(format!("Failed to export configs: {}", e)),
        }
    }

    /// 获取工具类别
    pub fn get_tool_categories(&self) -> Vec<ToolCategory> {
        self.categories.clone()
    }

    /// 获取类别的工具
    pub fn get_category_tools(&self, category_id: &str) -> Result<Vec<ToolConfig>, String> {
        let tools: Vec<ToolConfig> = self
            .tool_configs
            .values()
            .filter(|config| config.category_id == category_id)
            .cloned()
            .collect();
        Ok(tools)
    }

    /// 获取按类别分组的工具
    pub fn get_tools_by_category(&self, category: &str) -> Vec<ToolConfig> {
        self.tool_configs
            .values()
            .filter(|config| config.category_id == category)
            .cloned()
            .collect()
    }

    /// 检查工具是否需要审批
    pub fn requires_approval(&self, tool_name: &str) -> bool {
        self.tool_configs
            .get(tool_name)
            .map(|config| config.requires_approval)
            .unwrap_or(false)
    }

    /// 获取工具权限
    pub fn get_tool_permissions(&self, tool_name: &str) -> Vec<String> {
        self.tool_configs
            .get(tool_name)
            .map(|config| config.permissions.clone())
            .unwrap_or_default()
    }

    /// 启用工具
    pub fn enable_tool(&mut self, tool_name: &str) -> Result<(), String> {
        if let Some(config) = self.tool_configs.get_mut(tool_name) {
            config.enabled = true;
            Ok(())
        } else {
            Err(format!("Tool '{}' not found", tool_name))
        }
    }

    /// 禁用工具
    pub fn disable_tool(&mut self, tool_name: &str) -> Result<(), String> {
        if let Some(config) = self.tool_configs.get_mut(tool_name) {
            config.enabled = false;
            Ok(())
        } else {
            Err(format!("Tool '{}' not found", tool_name))
        }
    }

    /// 启用类别
    pub fn enable_category(&mut self, category_id: &str) -> Result<(), String> {
        if let Some(category) = self.categories.iter_mut().find(|c| c.id == category_id) {
            category.enabled = true;
            Ok(())
        } else {
            Err(format!("Category '{}' not found", category_id))
        }
    }

    /// 禁用类别
    pub fn disable_category(&mut self, category_id: &str) -> Result<(), String> {
        if let Some(category) = self.categories.iter_mut().find(|c| c.id == category_id) {
            category.enabled = false;
            Ok(())
        } else {
            Err(format!("Category '{}' not found", category_id))
        }
    }

    /// 获取启用的工具数量
    pub fn get_enabled_tools_count(&self) -> usize {
        self.tool_configs
            .values()
            .filter(|config| config.enabled)
            .count()
    }

    /// 获取启用的类别数量
    pub fn get_enabled_categories_count(&self) -> usize {
        self.categories
            .iter()
            .filter(|category| category.enabled)
            .count()
    }

    /// 检查类别是否存在
    pub fn category_exists(&self, category_id: &str) -> bool {
        self.categories.iter().any(|c| c.id == category_id)
    }

    /// 检查工具是否存在
    pub fn tool_exists(&self, tool_name: &str) -> bool {
        self.tool_configs.contains_key(tool_name)
    }

    /// 获取工具的显示名称
    pub fn get_tool_display_name(&self, tool_name: &str) -> Option<String> {
        self.tool_configs
            .get(tool_name)
            .map(|config| config.display_name.clone())
    }

    /// 获取类别的显示名称
    pub fn get_category_display_name(&self, category_id: &str) -> Option<String> {
        self.categories
            .iter()
            .find(|c| c.id == category_id)
            .map(|c| c.display_name.clone())
    }
}

/// 配置管理器建造者
pub struct ConfigManagerBuilder {
    tool_configs: HashMap<String, ToolConfig>,
    categories: Vec<ToolCategory>,
}

impl ConfigManagerBuilder {
    /// 创建新的建造者
    pub fn new() -> Self {
        Self {
            tool_configs: HashMap::new(),
            categories: Vec::new(),
        }
    }

    /// 添加工具配置
    pub fn with_tool_config(mut self, config: ToolConfig) -> Self {
        self.tool_configs.insert(config.name.clone(), config);
        self
    }

    /// 添加类别
    pub fn with_category(mut self, category: ToolCategory) -> Self {
        self.categories.push(category);
        self
    }

    /// 批量添加工具配置
    pub fn with_tool_configs(mut self, configs: Vec<ToolConfig>) -> Self {
        for config in configs {
            self.tool_configs.insert(config.name.clone(), config);
        }
        self
    }

    /// 批量添加类别
    pub fn with_categories(mut self, categories: Vec<ToolCategory>) -> Self {
        self.categories.extend(categories);
        self
    }

    /// 构建配置管理器
    pub fn build(self) -> ToolConfigManager {
        ToolConfigManager {
            tool_configs: self.tool_configs,
            categories: self.categories,
        }
    }
}

impl Default for ConfigManagerBuilder {
    fn default() -> Self {
        Self::new()
    }
}
