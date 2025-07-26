//! Auto Registration Macros
//!
//! This module provides macros for automatically registering tools and categories
//! at compile time using the inventory system.

/// Automatically register a tool
///
/// This macro registers a tool type with the auto registration system.
/// The tool type must implement the Tool trait and have a TOOL_NAME constant
/// and a new() method.
///
/// # Example
///
/// ```rust
/// use crate::auto_register_tool;
///
/// #[derive(Debug)]
/// pub struct ReadFileTool;
///
/// impl ReadFileTool {
///     pub const TOOL_NAME: &'static str = "read_file";
///     pub fn new() -> Self { Self }
/// }
///
/// impl Tool for ReadFileTool {
///     // ... implement trait methods
/// }
///
/// // Register the tool automatically
/// auto_register_tool!(ReadFileTool);
/// ```
#[macro_export]
macro_rules! auto_register_tool {
    ($tool_type:ty) => {
        inventory::submit! {
            $crate::tools::auto_registry::ToolRegistration {
                name: <$tool_type>::TOOL_NAME,
                constructor: || std::sync::Arc::new(<$tool_type>::new()),
            }
        }
    };
}

/// Automatically register a category
///
/// This macro registers a category type with the auto registration system.
/// The category type must implement the Category trait and have a CATEGORY_ID constant
/// and a new() method.
///
/// # Example
///
/// ```rust
/// use crate::auto_register_category;
///
/// #[derive(Debug)]
/// pub struct FileOperationsCategory;
///
/// impl FileOperationsCategory {
///     pub const CATEGORY_ID: &'static str = "file_operations";
///     pub fn new() -> Self { Self }
/// }
///
/// impl Category for FileOperationsCategory {
///     // ... implement trait methods
/// }
///
/// // Register the category automatically
/// auto_register_category!(FileOperationsCategory);
/// ```
#[macro_export]
macro_rules! auto_register_category {
    ($category_type:ty) => {
        inventory::submit! {
            $crate::tools::auto_registry::CategoryRegistration {
                id: <$category_type>::CATEGORY_ID,
                constructor: || Box::new(<$category_type>::new()),
            }
        }
    };
}

// Re-export the macros for easier access
pub use auto_register_category;
pub use auto_register_tool;

#[cfg(test)]
mod tests {
    use crate::tools::{Category, Parameter, Tool, ToolType};
    use async_trait::async_trait;
    use std::collections::HashMap;
    use std::sync::Arc;

    // Test tool implementation
    #[derive(Debug)]
    struct TestTool;

    impl TestTool {
        pub const TOOL_NAME: &'static str = "test_tool";
        pub fn new() -> Self {
            Self
        }
    }

    #[async_trait]
    impl Tool for TestTool {
        fn name(&self) -> String {
            Self::TOOL_NAME.to_string()
        }

        fn description(&self) -> String {
            "Test tool".to_string()
        }

        fn parameters(&self) -> Vec<Parameter> {
            vec![]
        }

        fn required_approval(&self) -> bool {
            false
        }

        fn tool_type(&self) -> ToolType {
            ToolType::AIParameterParsing
        }

        async fn execute(&self, _parameters: Vec<Parameter>) -> anyhow::Result<String> {
            Ok("test result".to_string())
        }
    }

    // Test category implementation
    #[derive(Debug)]
    struct TestCategory;

    impl TestCategory {
        pub const CATEGORY_ID: &'static str = "test_category";
        pub fn new() -> Self {
            Self
        }
    }

    impl Category for TestCategory {
        fn id(&self) -> String {
            Self::CATEGORY_ID.to_string()
        }

        fn name(&self) -> String {
            "Test Category".to_string()
        }

        fn display_name(&self) -> String {
            "Test Category".to_string()
        }

        fn description(&self) -> String {
            "Test category".to_string()
        }

        fn system_prompt(&self) -> String {
            "Test prompt".to_string()
        }

        fn icon(&self) -> String {
            "🧪".to_string()
        }

        fn frontend_icon(&self) -> String {
            "TestOutlined".to_string()
        }

        fn color(&self) -> String {
            "#ff0000".to_string()
        }

        fn strict_tools_mode(&self) -> bool {
            false
        }

        fn priority(&self) -> i32 {
            0
        }

        fn enable(&self) -> bool {
            true
        }

        fn category_type(&self) -> crate::tools::tool_types::CategoryId {
            crate::tools::tool_types::CategoryId::GeneralAssistant
        }

        fn required_tools(&self) -> &'static [&'static str] {
            &["test_tool"]
        }

        fn tools(&self) -> HashMap<String, Arc<dyn Tool>> {
            HashMap::new() // Simplified for test
        }
    }

    #[test]
    fn test_macro_compilation() {
        // These tests just verify that the macros compile correctly
        // The actual registration testing would require integration tests
        // since inventory collection happens at compile time

        // Test that we can create instances
        let _tool = TestTool::new();
        let _category = TestCategory::new();

        // Test constants exist
        assert_eq!(TestTool::TOOL_NAME, "test_tool");
        assert_eq!(TestCategory::CATEGORY_ID, "test_category");
    }
}
