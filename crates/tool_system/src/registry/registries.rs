//! Bean-style registration system for tools and categories
//!
//! Provides a Spring-like explicit registration system where tools and categories
//! are registered through factory implementations rather than compile-time macros.

use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use crate::registry::ToolFactory;
use crate::types::{Category, Tool, ToolDefinition, ToolPermission};

/// A thread-safe, bean-style registry for all tools.
///
/// Similar to Spring's ApplicationContext, this registry manages tool factories
/// and provides lazy initialization of tool instances.
///
/// # Example
///
/// ```rust,ignore
/// let registry = ToolRegistry::new();
/// registry.register_factory(Arc::new(ReadFileTool::new()));
/// registry.register_factory(Arc::new(WriteFileTool::new()));
///
/// let tool = registry.get_tool("read_file");
/// ```
pub struct ToolRegistry {
    /// Factory instances for creating tools
    factories: RwLock<HashMap<String, Arc<dyn ToolFactory>>>,
    /// Cached singleton tool instances
    tools: RwLock<HashMap<String, Arc<dyn Tool>>>,
}

impl ToolRegistry {
    /// Creates a new empty tool registry
    ///
    /// Tools must be registered using `register_factory()` before they can be used.
    pub fn new() -> Self {
        Self {
            factories: RwLock::new(HashMap::new()),
            tools: RwLock::new(HashMap::new()),
        }
    }

    /// Registers a tool factory in the registry
    ///
    /// # Arguments
    ///
    /// * `factory` - A tool factory implementation that will be used to create tool instances
    ///
    /// # Example
    ///
    /// ```rust,ignore
    /// registry.register_factory(Arc::new(ReadFileTool::new()));
    /// ```
    pub fn register_factory(&self, factory: Arc<dyn ToolFactory>) {
        let name = factory.tool_name().to_string();
        self.factories.write().unwrap().insert(name, factory);
    }

    /// Registers multiple tool factories at once
    ///
    /// # Arguments
    ///
    /// * `factories` - A vector of tool factory implementations
    ///
    /// # Example
    ///
    /// ```rust,ignore
    /// registry.register_factories(vec![
    ///     Arc::new(ReadFileTool::new()),
    ///     Arc::new(WriteFileTool::new()),
    /// ]);
    /// ```
    pub fn register_factories(&self, factories: Vec<Arc<dyn ToolFactory>>) {
        let mut factories_map = self.factories.write().unwrap();
        for factory in factories {
            let name = factory.tool_name().to_string();
            factories_map.insert(name, factory);
        }
    }

    /// Gets a tool instance by name
    ///
    /// For singleton-scoped tools, the instance is cached and reused.
    /// For prototype-scoped tools, a new instance is created each time.
    ///
    /// # Arguments
    ///
    /// * `name` - The unique name of the tool to retrieve
    ///
    /// # Returns
    ///
    /// * `Some(Arc<dyn Tool>)` - The tool instance if found
    /// * `None` - If no factory is registered for the given name
    pub fn get_tool(&self, name: &str) -> Option<Arc<dyn Tool>> {
        // Check if factory exists
        let factory = {
            let factories = self.factories.read().unwrap();
            factories.get(name).cloned()
        }?;

        // For singleton tools, check cache first
        if factory.is_singleton() {
            if let Some(cached) = self.tools.read().unwrap().get(name).cloned() {
                return Some(cached);
            }
        }

        // Create new instance
        let tool = factory.create();

        // Cache singleton instances
        if factory.is_singleton() {
            self.tools
                .write()
                .unwrap()
                .insert(name.to_string(), tool.clone());
        }

        Some(tool)
    }

    /// Lists all registered tool definitions
    ///
    /// # Returns
    ///
    /// A vector of tool definitions for all registered tools
    pub fn list_tool_definitions(&self) -> Vec<ToolDefinition> {
        let factories = self.factories.read().unwrap();
        factories
            .values()
            .filter_map(|factory| self.get_tool(factory.tool_name()))
            .map(|tool| tool.definition())
            .collect()
    }

    /// Filters tools based on allowed permissions
    ///
    /// Returns only tools whose required permissions are a subset of the allowed permissions.
    /// Also filters out tools marked with `hide_in_selector: true`.
    ///
    /// # Arguments
    ///
    /// * `allowed_permissions` - The list of permissions available to the user/agent
    ///
    /// # Returns
    ///
    /// A vector of tool definitions for tools that match the permission criteria
    pub fn filter_tools_by_permissions(
        &self,
        allowed_permissions: &[ToolPermission],
    ) -> Vec<ToolDefinition> {
        self.list_tool_definitions()
            .into_iter()
            .filter(|def| {
                // Tool is allowed if all its required permissions are in the allowed set
                let has_permissions = def
                    .required_permissions
                    .iter()
                    .all(|perm| allowed_permissions.contains(perm));
                // Also exclude tools that are marked as hidden
                let not_hidden = !def.hide_in_selector;
                has_permissions && not_hidden
            })
            .collect()
    }

    /// Returns the number of registered tool factories
    pub fn factory_count(&self) -> usize {
        self.factories.read().unwrap().len()
    }

    /// Returns the names of all registered tools
    pub fn list_tool_names(&self) -> Vec<String> {
        self.factories.read().unwrap().keys().cloned().collect()
    }

    /// Clears all cached tool instances (singleton cache)
    ///
    /// Factories remain registered, but tool instances will be recreated on next access
    pub fn clear_cache(&self) {
        self.tools.write().unwrap().clear();
    }
}

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Debug for ToolRegistry {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ToolRegistry")
            .field("factory_count", &self.factory_count())
            .field("tool_names", &self.list_tool_names())
            .finish()
    }
}

/// Category factory trait (similar to ToolFactory)
pub trait CategoryFactory: Send + Sync {
    fn create(&self) -> Box<dyn Category>;
    fn category_id(&self) -> &'static str;
}

/// A thread-safe registry for all categories
pub struct CategoryRegistry {
    factories: RwLock<HashMap<String, Arc<dyn CategoryFactory>>>,
}

impl CategoryRegistry {
    pub fn new() -> Self {
        Self {
            factories: RwLock::new(HashMap::new()),
        }
    }

    pub fn register_factory(&self, factory: Arc<dyn CategoryFactory>) {
        let id = factory.category_id().to_string();
        self.factories.write().unwrap().insert(id, factory);
    }

    pub fn get_category(&self, id: &str) -> Option<Box<dyn Category>> {
        let factory = {
            let factories = self.factories.read().unwrap();
            factories.get(id).cloned()
        }?;

        Some(factory.create())
    }

    pub fn list_categories(&self) -> Vec<Box<dyn Category>> {
        let factories = self.factories.read().unwrap();
        factories.values().map(|factory| factory.create()).collect()
    }
}

impl Default for CategoryRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Debug for CategoryRegistry {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CategoryRegistry")
            .field("factory_count", &self.factories.read().unwrap().len())
            .finish()
    }
}
