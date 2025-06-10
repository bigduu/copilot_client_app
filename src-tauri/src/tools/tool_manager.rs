//! 工具管理器实现
//!
//! 基于建造者模式的轻量级工具管理器实现

use crate::tools::config_manager::ToolConfigManager;
use crate::tools::tool_category::ToolCategory;
use crate::tools::types::ToolConfig;
use std::collections::HashMap;
use std::sync::Arc;

/// 工具管理器核心结构
#[derive(Debug)]
pub struct ToolManager {
    tools: HashMap<String, std::sync::Arc<dyn crate::tools::Tool>>,
    config_manager: std::sync::Arc<std::sync::RwLock<ToolConfigManager>>,
}

impl ToolManager {
    /// 创建新的工具管理器
    pub fn new(tools: HashMap<String, std::sync::Arc<dyn crate::tools::Tool>>) -> Self {
        let config_manager = std::sync::Arc::new(std::sync::RwLock::new(ToolConfigManager::default()));
        Self {
            tools,
            config_manager,
        }
    }

    /// 使用配置管理器创建工具管理器
    pub fn new_with_config(
        tools: HashMap<String, std::sync::Arc<dyn crate::tools::Tool>>,
        config_manager: ToolConfigManager,
    ) -> Self {
        let config_manager = std::sync::Arc::new(std::sync::RwLock::new(config_manager));
        Self {
            tools,
            config_manager,
        }
    }

    /// 获取工具实例
    pub fn get_tool(&self, name: &str) -> Option<std::sync::Arc<dyn crate::tools::Tool>> {
        // 检查工具是否启用
        if let Ok(config_manager) = self.config_manager.read() {
            if !config_manager.is_tool_enabled(name) {
                return None;
            }
        }
        self.tools.get(name).cloned()
    }

    /// 注册工具
    pub fn register_tool(&mut self, tool: std::sync::Arc<dyn crate::tools::Tool>) {
        let tool_name = tool.name();
        self.tools.insert(tool_name.clone(), tool.clone());

        // 在配置管理器中注册工具配置
        if let Ok(mut config_manager) = self.config_manager.write() {
            let tool_config = ToolConfig {
                name: tool.name(),
                display_name: tool.name(),
                description: tool.description(),
                category_id: ToolCategory::get_category_id_for_tool(&tool.name()),
                enabled: true,
                requires_approval: tool.required_approval(),
                auto_prefix: Some(format!("/{}", tool.name())),
                permissions: vec![],
                tool_type: match tool.tool_type() {
                    crate::tools::ToolType::AIParameterParsing => "AIParameterParsing".to_string(),
                    crate::tools::ToolType::RegexParameterExtraction => "RegexParameterExtraction".to_string(),
                },
                parameter_regex: tool.parameter_regex(),
                custom_prompt: tool.custom_prompt(),
            };
            config_manager.register_tool_config(tool_config);
        }
    }

    /// 获取配置管理器
    pub fn get_config_manager(&self) -> std::sync::Arc<std::sync::RwLock<ToolConfigManager>> {
        self.config_manager.clone()
    }

    /// 生成工具列表提示符
    pub fn list_tools(&self) -> String {
        let mut prompt = String::new();
        for tool in self.tools.values() {
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
        let config_manager = self.config_manager.read().unwrap();

        self.tools
            .values()
            .filter_map(|tool| {
                let tool_name = tool.name();

                // 检查工具是否启用
                if !config_manager.is_tool_enabled(&tool_name) {
                    return None;
                }

                // 获取工具配置
                let tool_config = config_manager.get_tool_config(&tool_name);

                let parameters = tool
                    .parameters()
                    .into_iter()
                    .map(|param| {
                        crate::command::tools::ParameterInfo {
                            name: param.name,
                            description: param.description,
                            required: param.required,
                            param_type: "string".to_string(), // Simplified for now
                        }
                    })
                    .collect();

                let tool_type_str = if let Some(config) = tool_config {
                    config.tool_type.clone()
                } else {
                    match tool.tool_type() {
                        crate::tools::ToolType::AIParameterParsing => "AIParameterParsing".to_string(),
                        crate::tools::ToolType::RegexParameterExtraction => {
                            "RegexParameterExtraction".to_string()
                        }
                    }
                };

                Some(crate::command::tools::ToolUIInfo {
                    name: tool.name(),
                    description: tool_config
                        .map(|c| c.description.clone())
                        .unwrap_or_else(|| tool.description()),
                    parameters,
                    tool_type: tool_type_str,
                    parameter_regex: tool_config
                        .and_then(|c| c.parameter_regex.clone())
                        .or_else(|| tool.parameter_regex()),
                    ai_response_template: tool_config
                        .and_then(|c| c.custom_prompt.clone())
                        .or_else(|| tool.custom_prompt()),
                })
            })
            .collect()
    }
}

// ============================================================================
// 工具管理器工厂函数
// ============================================================================

/// 创建默认的工具管理器
///
/// 这是新架构的主要入口点，自动注册所有可用的工具类别
/// 基于纯建造者模式，零硬编码实现
pub fn create_default_tool_manager() -> ToolManager {
    use crate::tools::categories::*;

    // 使用建造者模式构建类别和工具配置
    let (categories, tool_configs) = ToolManagerBuilder::new()
        .register_category(FileOperationsCategory::new())
        .register_category(CommandExecutionCategory::new())
        .register_category(GeneralAssistantCategory::new())
        .build_with_categories();

    // 创建实际的工具实例映射
    let tools = create_tool_instances();

    // 创建配置管理器并设置类别
    let mut config_manager = ToolConfigManager::default();
    config_manager.set_custom_categories(categories);

    // 注册工具配置
    for tool_config in tool_configs {
        config_manager.register_tool_config(tool_config);
    }

    ToolManager::new_with_config(tools, config_manager)
}

/// 创建带有自定义配置目录的工具管理器
pub fn create_tool_manager_with_config_dir(config_dir: std::path::PathBuf) -> ToolManager {
    use crate::tools::categories::*;

    // 使用建造者模式构建类别和工具配置
    // 图标和颜色通过 ToolCategory::get_default_icon/color 自动设置
    let (categories, tool_configs) = ToolManagerBuilder::new()
        .register_category(FileOperationsCategory::new())
        .register_category(CommandExecutionCategory::new())
        .register_category(GeneralAssistantCategory::new())
        .build_with_categories();

    // 创建实际的工具实例映射
    let tools = create_tool_instances();

    // 创建配置管理器
    let mut config_manager = ToolConfigManager::new(config_dir);
    config_manager.set_custom_categories(categories);

    // 注册工具配置
    for tool_config in tool_configs {
        config_manager.register_tool_config(tool_config);
    }

    ToolManager::new_with_config(tools, config_manager)
}

/// 创建基础工具管理器（向后兼容）
pub fn create_basic_tool_manager() -> ToolManager {
    let tools = create_tool_instances();
    let mut manager = ToolManager::new(tools);

    // 手动注册工具（保持向后兼容性）
    let tool_instances = create_tool_instances();
    for (_, tool) in tool_instances {
        manager.register_tool(tool);
    }

    manager
}

/// 创建所有工具实例
///
/// 这个函数集中管理所有工具的实例化逻辑
/// 确保工具创建的一致性和可维护性
fn create_tool_instances() -> HashMap<String, Arc<dyn crate::tools::Tool>> {
    use crate::tools::file_tools::*;
    
    let mut tools: HashMap<String, Arc<dyn crate::tools::Tool>> = HashMap::new();

    // 注册文件操作工具
    tools.insert("read_file".to_string(), Arc::new(ReadFileTool));
    tools.insert("create_file".to_string(), Arc::new(CreateFileTool));
    tools.insert("delete_file".to_string(), Arc::new(DeleteFileTool));
    tools.insert("update_file".to_string(), Arc::new(UpdateFileTool));
    tools.insert("search_files".to_string(), Arc::new(SearchFilesTool));
    tools.insert("simple_search".to_string(), Arc::new(SimpleSearchTool));
    tools.insert("append_file".to_string(), Arc::new(AppendFileTool));

    // 注册命令执行工具
    tools.insert("execute_command".to_string(), Arc::new(ExecuteCommandTool));

    tools
}

/// 工具管理器工厂
pub struct ToolManagerFactory;

impl ToolManagerFactory {
    /// 创建生产环境工具管理器
    pub fn create_production() -> ToolManager {
        create_default_tool_manager()
    }

    /// 创建测试环境工具管理器
    pub fn create_test() -> ToolManager {
        use crate::tools::categories::*;

        // 测试环境可能需要不同的配置
        let (categories, tool_configs) = ToolManagerBuilder::new()
            .register_category(FileOperationsCategory::new().with_enabled(true))
            .register_category(CommandExecutionCategory::new().with_enabled(false)) // 测试时禁用命令执行
            .register_category(GeneralAssistantCategory::new().with_enabled(true))
            .build_with_categories();

        let tools = create_tool_instances();
        let mut config_manager = ToolConfigManager::default();
        config_manager.set_custom_categories(categories);

        for tool_config in tool_configs {
            config_manager.register_tool_config(tool_config);
        }

        ToolManager::new_with_config(tools, config_manager)
    }

    /// 创建开发环境工具管理器
    pub fn create_development() -> ToolManager {
        // 开发环境启用所有功能
        create_default_tool_manager()
    }

    /// 创建自定义工具管理器
    pub fn create_custom<F>(configure: F) -> ToolManager
    where
        F: FnOnce(crate::tools::categories::ToolManagerBuilder) -> crate::tools::categories::ToolManagerBuilder,
    {
        use crate::tools::categories::ToolManagerBuilder;
        
        let builder = ToolManagerBuilder::new();
        let builder = configure(builder);
        let (categories, tool_configs) = builder.build_with_categories();

        let tools = create_tool_instances();
        let mut config_manager = ToolConfigManager::default();
        config_manager.set_custom_categories(categories);

        for tool_config in tool_configs {
            config_manager.register_tool_config(tool_config);
        }

        ToolManager::new_with_config(tools, config_manager)
    }
}

/// 工具发现和注册助手
pub struct ToolRegistry {
    tools: HashMap<String, Arc<dyn crate::tools::Tool>>,
}

impl ToolRegistry {
    /// 创建新的工具注册表
    pub fn new() -> Self {
        Self {
            tools: HashMap::new(),
        }
    }

    /// 注册工具
    pub fn register<T: crate::tools::Tool + 'static>(mut self, tool: T) -> Self {
        let name = tool.name();
        self.tools.insert(name, Arc::new(tool));
        self
    }

    /// 批量注册工具
    pub fn register_all(mut self, tools: Vec<Arc<dyn crate::tools::Tool>>) -> Self {
        for tool in tools {
            let name = tool.name();
            self.tools.insert(name, tool);
        }
        self
    }

    /// 完成注册并返回工具映射
    pub fn finish(self) -> HashMap<String, Arc<dyn crate::tools::Tool>> {
        self.tools
    }
}

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}