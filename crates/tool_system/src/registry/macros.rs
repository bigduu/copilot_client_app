//! Registration macros for automatic tool and category registration

/// Automatically register a tool with no parameters
#[macro_export]
macro_rules! auto_register_tool {
    ($tool_type:ty) => {
        inventory::submit! {
            $crate::registry::ToolRegistration {
                name: <$tool_type>::TOOL_NAME,
                constructor: || std::sync::Arc::new(<$tool_type>::new()),
            }
        }
    };
}

/// Automatically register a tool with custom constructor
#[macro_export]
macro_rules! auto_register_tool_with_constructor {
    ($tool_type:ty, $constructor:expr) => {
        inventory::submit! {
            $crate::registry::ToolRegistration {
                name: <$tool_type>::TOOL_NAME,
                constructor: $constructor,
            }
        }
    };
}

/// Automatically register a category with no parameters
#[macro_export]
macro_rules! auto_register_category {
    ($category_type:ty) => {
        inventory::submit! {
            $crate::registry::CategoryRegistration {
                id: <$category_type>::CATEGORY_ID,
                constructor: || Box::new(<$category_type>::new()),
            }
        }
    };
}

/// Automatically register a category with custom constructor
#[macro_export]
macro_rules! auto_register_category_with_constructor {
    ($category_type:ty, $constructor:expr) => {
        inventory::submit! {
            $crate::registry::CategoryRegistration {
                id: <$category_type>::CATEGORY_ID,
                constructor: $constructor,
            }
        }
    };
}

/// Advanced macro for registering tools with flexible parameter support
///
/// Usage examples:
/// ```rust,ignore
/// // No parameters (equivalent to auto_register_tool!)
/// auto_register_tool_advanced!(MyTool);
///
/// // With parameters
/// auto_register_tool_advanced!(MyTool, |config: &Config| {
///     Arc::new(MyTool::new(config.url.clone(), config.timeout))
/// });
///
/// // With closure capturing environment
/// auto_register_tool_advanced!(MyTool, || {
///     let url = std::env::var("API_URL").unwrap_or_default();
///     Arc::new(MyTool::new(url))
/// });
/// ```
#[macro_export]
macro_rules! auto_register_tool_advanced {
    // No parameters - use default new()
    ($tool_type:ty) => {
        inventory::submit! {
            $crate::registry::ToolRegistration {
                name: <$tool_type>::TOOL_NAME,
                constructor: || std::sync::Arc::new(<$tool_type>::new()),
            }
        }
    };

    // With custom constructor function
    ($tool_type:ty, $constructor:expr) => {
        inventory::submit! {
            $crate::registry::ToolRegistration {
                name: <$tool_type>::TOOL_NAME,
                constructor: $constructor,
            }
        }
    };
}

/// Advanced macro for registering categories with flexible parameter support
///
/// Usage examples:
/// ```rust,ignore
/// // No parameters (equivalent to auto_register_category!)
/// auto_register_category_advanced!(MyCategory);
///
/// // With parameters
/// auto_register_category_advanced!(MyCategory, |config: &Config| {
///     Box::new(MyCategory::new(config.enabled, config.max_tools))
/// });
///
/// // With closure capturing environment
/// auto_register_category_advanced!(MyCategory, || {
///     let enabled = std::env::var("CATEGORY_ENABLED").unwrap_or_default() == "true";
///     Box::new(MyCategory::new(enabled))
/// });
/// ```
#[macro_export]
macro_rules! auto_register_category_advanced {
    // No parameters - use default new()
    ($category_type:ty) => {
        inventory::submit! {
            $crate::registry::CategoryRegistration {
                id: <$category_type>::CATEGORY_ID,
                constructor: || Box::new(<$category_type>::new()),
            }
        }
    };

    // With custom constructor function
    ($category_type:ty, $constructor:expr) => {
        inventory::submit! {
            $crate::registry::CategoryRegistration {
                id: <$category_type>::CATEGORY_ID,
                constructor: $constructor,
            }
        }
    };
}

// Re-export for convenience
pub use auto_register_category;
pub use auto_register_category_advanced;
pub use auto_register_category_with_constructor;
pub use auto_register_tool;
pub use auto_register_tool_advanced;
pub use auto_register_tool_with_constructor;
