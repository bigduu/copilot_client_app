//! Internal Company Module
//!
//! This module provides a context-based initialization system for company-specific functionality.
//! The actual initialization logic is implemented in external files that don't exist in the external environment.

use std::collections::HashMap;
use std::sync::Arc;
use tauri::{App, Manager, Runtime};

use crate::extension_system::{Category, Tool};

// Sub-modules
pub mod categories;
pub mod services;
pub mod tools;

// Re-exports
pub use categories::*;
pub use services::*;
pub use tools::*;

/// Internal Context
///
/// Contains all necessary dependencies and configurations for internal module initialization.
/// This context is passed to the init function to provide access to app state, registries, and configurations.
pub struct InternalContext<R: Runtime> {
    /// Tauri app handle for state management
    pub app: *mut App<R>,
    /// Configuration from environment variables
    pub config: InternalConfig,
    /// Tool registry for manual tool registration
    pub tool_registry: Arc<dyn ToolRegistry>,
    /// Category registry for manual category registration
    pub category_registry: Arc<dyn CategoryRegistry>,
}

/// Internal Configuration
///
/// Configuration loaded from environment variables and other sources
#[derive(Debug, Clone)]
pub struct InternalConfig {
    pub company_internal_enabled: bool,
    pub bitbucket_base_url: String,
    pub confluence_base_url: String,
    pub proxy_config: Option<services::ProxyConfig>,
    pub auth_config: Option<services::AuthConfig>,
}

/// Tool Registry trait
///
/// Allows manual registration of tools with parameters
pub trait ToolRegistry: Send + Sync {
    fn register_tool(
        &self,
        name: &str,
        constructor: Box<dyn Fn(&InternalConfig) -> Arc<dyn Tool> + Send + Sync>,
    );
    fn get_tool(&self, name: &str, config: &InternalConfig) -> Option<Arc<dyn Tool>>;
    fn list_tools(&self) -> Vec<String>;
}

/// Category Registry trait
///
/// Allows manual registration of categories with parameters
pub trait CategoryRegistry: Send + Sync {
    fn register_category(
        &self,
        id: &str,
        constructor: Box<dyn Fn(&InternalConfig) -> Box<dyn Category> + Send + Sync>,
    );
    fn get_category(&self, id: &str, config: &InternalConfig) -> Option<Box<dyn Category>>;
    fn list_categories(&self) -> Vec<String>;
}

/// Simple in-memory tool registry implementation
pub struct SimpleToolRegistry {
    tools: std::sync::Mutex<
        HashMap<String, Box<dyn Fn(&InternalConfig) -> Arc<dyn Tool> + Send + Sync>>,
    >,
}

impl SimpleToolRegistry {
    pub fn new() -> Self {
        Self {
            tools: std::sync::Mutex::new(HashMap::new()),
        }
    }
}

impl ToolRegistry for SimpleToolRegistry {
    fn register_tool(
        &self,
        name: &str,
        constructor: Box<dyn Fn(&InternalConfig) -> Arc<dyn Tool> + Send + Sync>,
    ) {
        let mut tools = self.tools.lock().unwrap();
        tools.insert(name.to_string(), constructor);
    }

    fn get_tool(&self, name: &str, config: &InternalConfig) -> Option<Arc<dyn Tool>> {
        let tools = self.tools.lock().unwrap();
        tools.get(name).map(|constructor| constructor(config))
    }

    fn list_tools(&self) -> Vec<String> {
        let tools = self.tools.lock().unwrap();
        tools.keys().cloned().collect()
    }
}

/// Simple in-memory category registry implementation
pub struct SimpleCategoryRegistry {
    categories: std::sync::Mutex<
        HashMap<String, Box<dyn Fn(&InternalConfig) -> Box<dyn Category> + Send + Sync>>,
    >,
}

impl SimpleCategoryRegistry {
    pub fn new() -> Self {
        Self {
            categories: std::sync::Mutex::new(HashMap::new()),
        }
    }
}

impl CategoryRegistry for SimpleCategoryRegistry {
    fn register_category(
        &self,
        id: &str,
        constructor: Box<dyn Fn(&InternalConfig) -> Box<dyn Category> + Send + Sync>,
    ) {
        let mut categories = self.categories.lock().unwrap();
        categories.insert(id.to_string(), constructor);
    }

    fn get_category(&self, id: &str, config: &InternalConfig) -> Option<Box<dyn Category>> {
        let categories = self.categories.lock().unwrap();
        categories.get(id).map(|constructor| constructor(config))
    }

    fn list_categories(&self) -> Vec<String> {
        let categories = self.categories.lock().unwrap();
        categories.keys().cloned().collect()
    }
}

impl InternalConfig {
    /// Load configuration from environment variables
    pub fn from_environment() -> Self {
        Self {
            company_internal_enabled: std::env::var("COMPANY_INTERNAL").unwrap_or_default()
                == "true",
            bitbucket_base_url: std::env::var("BITBUCKET_BASE_URL")
                .unwrap_or_else(|_| "https://bitbucket.company.com".to_string()),
            confluence_base_url: std::env::var("CONFLUENCE_BASE_URL")
                .unwrap_or_else(|_| "https://confluence.company.com".to_string()),
            proxy_config: services::ProxyConfig::from_environment(),
            auth_config: services::AuthConfig::from_environment(),
        }
    }
}

impl<R: Runtime> InternalContext<R> {
    /// Create a new internal context
    pub fn new(app: &mut App<R>) -> Self {
        let config = InternalConfig::from_environment();
        let tool_registry = Arc::new(SimpleToolRegistry::new());
        let category_registry = Arc::new(SimpleCategoryRegistry::new());

        Self {
            app: app as *mut App<R>,
            config,
            tool_registry,
            category_registry,
        }
    }

    /// Get a reference to the app (unsafe but necessary for the design)
    ///
    /// # Safety
    ///
    /// This function is unsafe because it dereferences a raw pointer and returns a mutable reference
    /// from an immutable self reference. The caller must ensure that:
    /// - The raw pointer `self.app` is valid and points to a live `App<R>` instance
    /// - No other mutable references to the same `App<R>` instance exist during the lifetime of the returned reference
    /// - The returned mutable reference is not used to invalidate any existing immutable references
    ///
    /// This design is necessary to work around Rust's borrowing rules in the context of Tauri's
    /// application lifecycle management.
    pub unsafe fn app(&mut self) -> &mut App<R> {
        &mut *self.app
    }
}

/// Initialize internal module with context
///
/// This function attempts to call an external init function if it exists.
/// The external init function should be implemented in a separate file that only exists in the company environment.
pub fn init_internal<R: Runtime>(
    context: InternalContext<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    if context.config.company_internal_enabled {
        log::info!("COMPANY_INTERNAL=true, internal module context is ready");
        log::info!("To enable internal tools, implement the init function in company_init.rs");

        // The actual init logic should be implemented in a separate file
        // that only exists in the company environment:
        // src/internal/company_init.rs with a public init(context) function

        // For now, just log that the context is available
        log::debug!(
            "Internal context created with {} tool registry and {} category registry",
            context.tool_registry.list_tools().len(),
            context.category_registry.list_categories().len()
        );
    } else {
        log::debug!("Internal module available but not enabled (COMPANY_INTERNAL != true)");
    }

    Ok(())
}

/// Setup internal module in the main app setup
///
/// This should be called from the main setup function in lib.rs
pub fn setup_internal<R: Runtime>(app: &mut App<R>) -> Result<(), Box<dyn std::error::Error>> {
    let context = InternalContext::new(app);
    init_internal(context)?;
    Ok(())
}
