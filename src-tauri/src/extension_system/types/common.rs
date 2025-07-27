//! Common types shared across the extension system

use serde::{Deserialize, Serialize};

/// Category ID enumeration - provides type-safe category identifiers
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum CategoryId {
    /// File operations category
    FileOperations,
    /// Command execution category
    CommandExecution,
    /// General assistant category
    GeneralAssistant,
    /// Company-specific tools category
    CompanyTools,
}

impl CategoryId {
    /// Get the string representation of the category ID
    pub fn as_str(&self) -> &'static str {
        match self {
            CategoryId::FileOperations => "file_operations",
            CategoryId::CommandExecution => "command_execution",
            CategoryId::GeneralAssistant => "general_assistant",
            CategoryId::CompanyTools => "company_tools",
        }
    }

    /// Create category ID from string
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "file_operations" => Some(CategoryId::FileOperations),
            "command_execution" => Some(CategoryId::CommandExecution),
            "general_assistant" => Some(CategoryId::GeneralAssistant),
            "company_tools" => Some(CategoryId::CompanyTools),
            _ => None,
        }
    }
}

/// Tool type enumeration
#[derive(Debug, Clone, PartialEq)]
pub enum ToolType {
    /// Tools that require AI parameter analysis
    AIParameterParsing,
    /// Tools that use regex for direct parameter extraction
    RegexParameterExtraction,
}

/// Tool parameter definition
#[derive(Debug, Clone)]
pub struct Parameter {
    pub name: String,
    pub description: String,
    pub required: bool,
    pub value: String,
}
