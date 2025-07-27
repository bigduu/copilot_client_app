//! Registration macros for automatic tool and category registration

/// Automatically register a tool
#[macro_export]
macro_rules! auto_register_tool {
    ($tool_type:ty) => {
        inventory::submit! {
            $crate::extension_system::registry::ToolRegistration {
                name: <$tool_type>::TOOL_NAME,
                constructor: || std::sync::Arc::new(<$tool_type>::new()),
            }
        }
    };
}

/// Automatically register a category
#[macro_export]
macro_rules! auto_register_category {
    ($category_type:ty) => {
        inventory::submit! {
            $crate::extension_system::registry::CategoryRegistration {
                id: <$category_type>::CATEGORY_ID,
                constructor: || Box::new(<$category_type>::new()),
            }
        }
    };
}

// Re-export for convenience
pub use auto_register_tool;
pub use auto_register_category;
