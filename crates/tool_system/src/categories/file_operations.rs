//! File Operations Category
//!
//! Contains all file-related tools: read, create, delete, update, search, etc.

use crate::{registry::macros::auto_register_category, types::{Category, CategoryId, CategoryMetadata}};

/// File Operations Category
#[derive(Debug)]
pub struct FileOperationsCategory {
    enabled: bool,
}

impl FileOperationsCategory {
    pub const CATEGORY_ID: &'static str = "file_operations";

    /// Create a new file operations category (disabled by default)
    pub fn new() -> Self {
        Self { enabled: false }
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
    fn metadata(&self) -> CategoryMetadata {
        CategoryMetadata {
            id: Self::CATEGORY_ID.to_string(),
            name: "file_operations".to_string(),
            display_name: "File Operations".to_string(),
            description: "Provides comprehensive file operation functionality, including read, create, update, delete, and search".to_string(),
            icon: "FileTextOutlined".to_string(),
            emoji_icon: "📁".to_string(),
            enabled: self.enabled,
            strict_tools_mode: false, // File operations may require natural language descriptions
            system_prompt: "You are a professional file operations assistant responsible for handling various file-related tasks, including reading, creating, updating, deleting, and searching files. You need to ensure the security and accuracy of file operations, following best practices for file system operations. When performing file operations, please pay attention to permission checks, path validation, and data integrity.".to_string(),
            category_type: CategoryId::FileOperations,
            priority: 10, // File operations are high-priority core functionality
        }
    }

    fn required_tools(&self) -> &'static [&'static str] {
        &[
            "read_file",
            "create_file",
            "delete_file",
            "update_file",
            "append_file",
            "search", // Only keep the simple search tool
        ]
    }

    fn enable(&self) -> bool {
        // Can add file system permission checks and other logic here
        self.enabled
    }
}

// Auto-register the category
auto_register_category!(FileOperationsCategory);
