//! Factory pattern for tool registration
//!
//! This module provides a Spring-like bean factory system for tool registration.
//! Tools implement the ToolFactory trait to be registered in the ToolRegistry.

use std::sync::Arc;
use crate::types::Tool;

/// Factory trait for creating tool instances
///
/// Similar to Spring's FactoryBean, this trait allows tools to define
/// how they should be created and registered in the tool registry.
///
/// # Example
///
/// ```rust,ignore
/// impl ToolFactory for MyTool {
///     fn create(&self) -> Arc<dyn Tool> {
///         Arc::new(MyTool::new())
///     }
///
///     fn tool_name(&self) -> &'static str {
///         Self::TOOL_NAME
///     }
/// }
/// ```
pub trait ToolFactory: Send + Sync {
    /// Creates a new instance of the tool
    ///
    /// This method is called by the ToolRegistry when the tool
    /// is first requested. The instance is cached for subsequent requests.
    fn create(&self) -> Arc<dyn Tool>;

    /// Returns the unique name of the tool
    ///
    /// This name is used as the key in the registry to identify the tool.
    fn tool_name(&self) -> &'static str;

    /// Optional: Returns whether this factory creates singleton instances
    ///
    /// Default: true (tool instances are cached and reused)
    /// If false, a new instance is created on each get_tool() call
    fn is_singleton(&self) -> bool {
        true
    }
}

/// Helper macro to implement ToolFactory for tools with a simple new() constructor
///
/// # Example
///
/// ```rust,ignore
/// impl_tool_factory!(ReadFileTool);
/// ```
#[macro_export]
macro_rules! impl_tool_factory {
    ($tool_type:ty) => {
        impl $crate::registry::ToolFactory for $tool_type {
            fn create(&self) -> std::sync::Arc<dyn $crate::types::Tool> {
                std::sync::Arc::new(<$tool_type>::new())
            }

            fn tool_name(&self) -> &'static str {
                <$tool_type>::TOOL_NAME
            }
        }
    };
}

/// Helper macro to implement ToolFactory with custom creation logic
///
/// # Example
///
/// ```rust,ignore
/// impl_tool_factory_with_constructor!(MyTool, |_self| {
///     let config = load_config();
///     Arc::new(MyTool::with_config(config))
/// });
/// ```
#[macro_export]
macro_rules! impl_tool_factory_with_constructor {
    ($tool_type:ty, $constructor:expr) => {
        impl $crate::registry::ToolFactory for $tool_type {
            fn create(&self) -> std::sync::Arc<dyn $crate::types::Tool> {
                ($constructor)(self)
            }

            fn tool_name(&self) -> &'static str {
                <$tool_type>::TOOL_NAME
            }
        }
    };
}

/// Helper macro to implement ToolFactory for prototype-scoped tools
///
/// # Example
///
/// ```rust,ignore
/// impl_tool_factory_prototype!(MyTool);
/// ```
#[macro_export]
macro_rules! impl_tool_factory_prototype {
    ($tool_type:ty) => {
        impl $crate::registry::ToolFactory for $tool_type {
            fn create(&self) -> std::sync::Arc<dyn $crate::types::Tool> {
                std::sync::Arc::new(<$tool_type>::new())
            }

            fn tool_name(&self) -> &'static str {
                <$tool_type>::TOOL_NAME
            }

            fn is_singleton(&self) -> bool {
                false
            }
        }
    };
}

// Re-export for convenience
pub use impl_tool_factory;
pub use impl_tool_factory_with_constructor;
pub use impl_tool_factory_prototype;
