//! Core type definitions for the tool system
//!
//! This module contains the basic types for the tool management system, providing minimal, type-safe core abstractions.

use serde::{Deserialize, Serialize};

/// Category type enumeration
/// Used to identify the functional nature of different categories, frontend can display different icons, styles or functions based on this
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum CategoryType {
    /// File operations category
    FileOperations,
    /// Command execution category
    CommandExecution,
    /// General assistant category
    GeneralAssistant,
}

impl CategoryType {
    /// Get the string representation of the category type
    pub fn as_str(&self) -> &'static str {
        match self {
            CategoryType::FileOperations => "file_operations",
            CategoryType::CommandExecution => "command_execution",
            CategoryType::GeneralAssistant => "general_assistant",
        }
    }

    /// Create category type from string
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "file_operations" => Some(CategoryType::FileOperations),
            "command_execution" => Some(CategoryType::CommandExecution),
            "general_assistant" => Some(CategoryType::GeneralAssistant),
            _ => None,
        }
    }
}

/// Tool configuration structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolConfig {
    pub name: String,
    pub display_name: String,
    pub description: String,
    pub category_id: String,
    pub enabled: bool,
    pub requires_approval: bool,
    pub auto_prefix: Option<String>,
    pub permissions: Vec<String>,
    pub tool_type: String,
    pub parameter_regex: Option<String>,
    pub custom_prompt: Option<String>,
}

impl ToolConfig {
    /// Set category ID
    pub fn with_category_id(mut self, category_id: String) -> Self {
        self.category_id = category_id;
        self
    }

    /// Set enabled status
    pub fn with_enabled(mut self, enabled: bool) -> Self {
        self.enabled = enabled;
        self
    }

    /// Set display name
    pub fn with_display_name(mut self, display_name: String) -> Self {
        self.display_name = display_name;
        self
    }

    /// Set description
    pub fn with_description(mut self, description: String) -> Self {
        self.description = description;
        self
    }
}

/// Tool category structure
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ToolCategory {
    pub id: String,           // Category ID, same as name
    pub name: String,         // Internal name
    pub display_name: String, // Display name
    pub description: String,  // Description
    pub icon: String,         // Frontend icon name (e.g., "FileTextOutlined")
    pub emoji_icon: String,   // Emoji icon (e.g., "📁")
    pub enabled: bool,        // Whether enabled
    #[serde(default)]
    pub strict_tools_mode: bool, // Strict tools mode
    #[serde(default)]
    pub system_prompt: String, // System prompt
    pub category_type: CategoryType, // Category type
}

impl ToolCategory {
    /// Create a new tool category
    pub fn new(
        name: String,
        display_name: String,
        description: String,
        icon: String,
        emoji_icon: String,
        category_type: CategoryType,
    ) -> Self {
        Self {
            id: name.clone(), // id is the same as name
            name,
            display_name,
            description,
            icon,
            emoji_icon,
            enabled: true,
            strict_tools_mode: false,
            system_prompt: String::new(),
            category_type,
        }
    }

    /// Set enabled status
    pub fn with_enabled(mut self, enabled: bool) -> Self {
        self.enabled = enabled;
        self
    }

    /// Set strict tools mode
    pub fn with_strict_tools_mode(mut self, strict_tools_mode: bool) -> Self {
        self.strict_tools_mode = strict_tools_mode;
        self
    }

    /// Set system prompt
    pub fn with_system_prompt(mut self, system_prompt: String) -> Self {
        self.system_prompt = system_prompt;
        self
    }
}
