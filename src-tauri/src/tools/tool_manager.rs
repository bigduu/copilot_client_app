//! Tool Manager Implementation
//!
//! Clean tool manager implementation based on new architecture, directly managing Category list

use crate::tools::category::{Category, CategoryInfo};
use crate::tools::tool_types::{ToolCategory, ToolConfig};
use std::collections::HashMap;
use std::sync::Arc;

/// 工具管理器核心结构
#[derive(Debug)]
pub struct ToolManager {
    categories: Vec<Box<dyn Category>>,
    tool_instances: HashMap<String, Arc<dyn crate::tools::Tool>>,
}

impl ToolManager {
    /// 创建新的工具管理器
    pub fn new(categories: Vec<Box<dyn Category>>) -> Self {
        let mut tool_instances = HashMap::new();

        // 收集所有启用类别的工具实例
        for category in &categories {
            if category.enable() {
                let category_tools = category.tools();
                tool_instances.extend(category_tools);
            }
        }

        Self {
            categories,
            tool_instances,
        }
    }

    /// 获取所有启用的类别
    pub fn get_enabled_categories(&self) -> Vec<ToolCategory> {
        self.categories
            .iter()
            .filter(|category| category.enable())
            .map(|category| category.build_info().category)
            .collect()
    }

    /// 根据ID获取类别
    pub fn get_category_by_id(&self, category_id: &str) -> Option<ToolCategory> {
        self.categories
            .iter()
            .find(|category| category.id() == category_id)
            .map(|category| category.build_info().category)
    }

    /// 获取指定类别下的工具配置
    pub fn get_category_tools(&self, category_id: &str) -> Vec<ToolConfig> {
        self.categories
            .iter()
            .find(|category| category.id() == category_id && category.enable())
            .map(|category| category.build_tool_configs())
            .unwrap_or_default()
    }

    /// 获取工具实例
    pub fn get_tool(&self, name: &str) -> Option<Arc<dyn crate::tools::Tool>> {
        self.tool_instances.get(name).cloned()
    }

    /// 获取所有工具实例
    pub fn get_all_tools(&self) -> &HashMap<String, Arc<dyn crate::tools::Tool>> {
        &self.tool_instances
    }

    /// 获取所有类别信息（包含优先级排序）
    pub fn get_all_category_info(&self) -> Vec<CategoryInfo> {
        let mut category_infos: Vec<CategoryInfo> = self
            .categories
            .iter()
            .map(|category| category.build_info())
            .collect();

        // 按优先级排序
        category_infos.sort_by(|a, b| b.priority.cmp(&a.priority));
        category_infos
    }

    /// 获取启用的类别信息
    pub fn get_enabled_category_info(&self) -> Vec<CategoryInfo> {
        let mut category_infos: Vec<CategoryInfo> = self
            .categories
            .iter()
            .filter(|category| category.enable())
            .map(|category| category.build_info())
            .collect();

        // 按优先级排序
        category_infos.sort_by(|a, b| b.priority.cmp(&a.priority));
        category_infos
    }

    /// 检查工具是否存在且启用
    pub fn is_tool_available(&self, tool_name: &str) -> bool {
        self.tool_instances.contains_key(tool_name)
    }

    /// 获取类别数量
    pub fn category_count(&self) -> usize {
        self.categories.len()
    }

    /// 获取启用的类别数量
    pub fn enabled_category_count(&self) -> usize {
        self.categories.iter().filter(|c| c.enable()).count()
    }

    /// 获取工具数量
    pub fn tool_count(&self) -> usize {
        self.tool_instances.len()
    }

    /// 生成工具列表提示符
    pub fn list_tools(&self) -> String {
        let mut prompt = String::new();
        for tool in self.tool_instances.values() {
            let parameters = tool.parameters();
            let mut parameters_prompt = String::new();
            for parameter in parameters {
                parameters_prompt.push_str(&format!(
                    r#"
                        <{}>
                        <parameter_description>
                        {}
                        </parameter_description>
                        </{}>
                    "#,
                    parameter.name, parameter.description, parameter.name
                ));
            }

            prompt.push_str(&format!(
                r#"
                    <tool>
                    <tool_name>
                    {}
                    </tool_name>
                    <tool_description>
                    {}
                    </tool_description>
                    <tool_parameters>
                    {}
                    </tool_parameters>
                    <tool_required_approval>
                    {}
                    </tool_required_approval>
                    </tool>
                "#,
                tool.name(),
                tool.description(),
                parameters_prompt,
                tool.required_approval()
            ));
        }
        prompt
    }

    /// 获取UI用工具信息
    pub fn list_tools_for_ui(&self) -> Vec<crate::command::tools::ToolUIInfo> {
        self.tool_instances
            .values()
            .map(|tool| {
                let parameters = tool
                    .parameters()
                    .into_iter()
                    .map(|param| {
                        crate::command::tools::ParameterInfo {
                            name: param.name,
                            description: param.description,
                            required: param.required,
                            param_type: "string".to_string(), // 简化处理
                        }
                    })
                    .collect();

                let tool_type = match tool.tool_type() {
                    crate::tools::ToolType::AIParameterParsing => "AIParameterParsing".to_string(),
                    crate::tools::ToolType::RegexParameterExtraction => {
                        "RegexParameterExtraction".to_string()
                    }
                };

                crate::command::tools::ToolUIInfo {
                    name: tool.name(),
                    description: tool.description(),
                    parameters,
                    tool_type,
                    parameter_regex: tool.parameter_regex(),
                    ai_response_template: tool.custom_prompt(),
                }
            })
            .collect()
    }
}

/// 工具管理器构建器
/// 用于简化工具管理器的创建过程
pub struct ToolManagerBuilder {
    categories: Vec<Box<dyn Category>>,
}

impl ToolManagerBuilder {
    /// 创建新的构建器
    pub fn new() -> Self {
        Self {
            categories: Vec::new(),
        }
    }

    /// 添加类别
    pub fn add_category<T: Category + 'static>(mut self, category: T) -> Self {
        self.categories.push(Box::new(category));
        self
    }

    /// 构建工具管理器
    pub fn build(self) -> ToolManager {
        ToolManager::new(self.categories)
    }
}

impl Default for ToolManagerBuilder {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// 便利函数
// ============================================================================

/// 创建默认的工具管理器
/// 注册所有可用的工具类别
pub fn create_default_tool_manager() -> ToolManager {
    // 使用自动注册系统获取所有类别
    let categories = crate::tools::AutoToolRegistry::get_all_categories();
    ToolManager::new(categories)
}
