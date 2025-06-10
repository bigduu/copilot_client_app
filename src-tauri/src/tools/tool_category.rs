//! 工具类别相关类型和实现
//!
//! 包含工具类别的结构定义和相关方法

use serde::{Deserialize, Serialize};

/// 兼容性工具类别结构（保持向后兼容）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCategory {
    pub id: String,
    pub name: String,
    pub description: String,
    pub system_prompt: String,
    pub tools: Vec<String>,
    pub restrict_conversation: bool,
    pub enabled: bool,
    pub auto_prefix: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
    #[serde(default)]
    pub strict_tools_mode: bool,
}

impl ToolCategory {
    /// 获取工具的类别ID（用于向后兼容）
    pub fn get_category_id_for_tool(tool_name: &str) -> String {
        match tool_name {
            "read_file" | "create_file" | "delete_file" | "update_file" | "search_files"
            | "simple_search" | "append_file" => "file_operations".to_string(),
            "execute_command" => "command_execution".to_string(),
            _ => "general_assistant".to_string(),
        }
    }

    /// 获取类别的默认图标名称
    /// 返回前端兼容的 Ant Design 图标名称
    pub fn get_default_icon(category_id: &str) -> String {
        match category_id {
            "file_operations" => "FileTextOutlined".to_string(),
            "command_execution" => "PlayCircleOutlined".to_string(),
            "general_assistant" => "ToolOutlined".to_string(),
            _ => "ToolOutlined".to_string(),
        }
    }

    /// 获取类别的默认颜色
    /// 返回前端兼容的颜色名称
    pub fn get_default_color(category_id: &str) -> String {
        match category_id {
            "file_operations" => "green".to_string(),
            "command_execution" => "magenta".to_string(),
            "general_assistant" => "blue".to_string(),
            _ => "default".to_string(),
        }
    }

    /// 从单个工具名映射到类别的图标
    /// 用于向后兼容前端的单个工具图标映射
    pub fn get_icon_for_tool(tool_name: &str) -> String {
        match tool_name {
            "read_file" => "FileTextOutlined".to_string(),
            "create_file" => "FolderOpenOutlined".to_string(),
            "delete_file" => "DeleteOutlined".to_string(),
            "update_file" => "CodeOutlined".to_string(),
            "search_files" | "simple_search" => "SearchOutlined".to_string(),
            "execute_command" => "PlayCircleOutlined".to_string(),
            _ => "ToolOutlined".to_string(),
        }
    }

    /// 从单个工具名映射到类别的颜色
    /// 用于向后兼容前端的单个工具颜色映射
    pub fn get_color_for_tool(tool_name: &str) -> String {
        match tool_name {
            "read_file" => "green".to_string(),
            "create_file" => "orange".to_string(),
            "delete_file" => "red".to_string(),
            "update_file" => "purple".to_string(),
            "search_files" | "simple_search" => "cyan".to_string(),
            "execute_command" => "magenta".to_string(),
            _ => "blue".to_string(),
        }
    }
}