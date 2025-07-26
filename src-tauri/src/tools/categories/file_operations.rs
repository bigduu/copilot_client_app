//! File Operations Category
//!
//! Contains all file-related tools: read, create, delete, update, search, etc.

use crate::auto_register_category;
use crate::tools::category::Category;
use crate::tools::tool_types::CategoryId;

/// File Operations Category
#[derive(Debug)]
pub struct FileOperationsCategory {
    enabled: bool,
}

impl FileOperationsCategory {
    pub const CATEGORY_ID: &'static str = "file_operations";

    /// Create a new file operations category
    pub fn new() -> Self {
        Self { enabled: true }
    }

    /// Set whether this category is enabled
    pub fn with_enabled(mut self, enabled: bool) -> Self {
        self.enabled = enabled;
        self
    }
}

impl Default for FileOperationsCategory {
    fn default() -> Self {
        Self::new()
    }
}

impl Category for FileOperationsCategory {
    fn id(&self) -> String {
        Self::CATEGORY_ID.to_string()
    }

    fn name(&self) -> String {
        "file_operations".to_string()
    }

    fn display_name(&self) -> String {
        "File Operations".to_string()
    }

    fn description(&self) -> String {
        "Provides comprehensive file operation functionality, including read, create, update, delete, and search".to_string()
    }

    fn system_prompt(&self) -> String {
        "You are a professional file operations assistant responsible for handling various file-related tasks, including reading, creating, updating, deleting, and searching files. You need to ensure the security and accuracy of file operations, following best practices for file system operations. When performing file operations, please pay attention to permission checks, path validation, and data integrity.".to_string()
    }

    fn icon(&self) -> String {
        "📁".to_string()
    }

    fn frontend_icon(&self) -> String {
        "FileTextOutlined".to_string()
    }

    fn color(&self) -> String {
        "green".to_string()
    }

    fn strict_tools_mode(&self) -> bool {
        false // File operations may require natural language descriptions
    }

    fn priority(&self) -> i32 {
        10 // File operations are high-priority core functionality
    }

    fn enable(&self) -> bool {
        // Can add file system permission checks and other logic here
        self.enabled
    }

    fn category_type(&self) -> CategoryId {
        CategoryId::FileOperations
    }

    fn required_tools(&self) -> &'static [&'static str] {
        &[
            "read_file",
            "create_file",
            "delete_file",
            "update_file",
            "append_file",
            "search_files",
            "search",
        ]
    }
}

// Auto-register the category
auto_register_category!(FileOperationsCategory);
