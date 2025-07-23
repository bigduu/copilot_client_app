//! Category Factory
//!
//! Provides a centralized way to register and create tool categories

use crate::tools::category::Category;
use crate::tools::categories::*;
use std::collections::HashMap;

/// Category Factory for creating and registering categories
pub struct CategoryFactory {
    /// Registry of category constructors
    constructors: HashMap<String, Box<dyn Fn() -> Box<dyn Category> + Send + Sync>>,
}

impl CategoryFactory {
    /// Create a new CategoryFactory
    pub fn new() -> Self {
        let mut factory = Self {
            constructors: HashMap::new(),
        };
        
        // Register default categories
        factory.register_defaults();
        factory
    }

    /// Register a category constructor
    pub fn register<F>(&mut self, name: &str, constructor: F)
    where
        F: Fn() -> Box<dyn Category> + Send + Sync + 'static,
    {
        self.constructors.insert(name.to_string(), Box::new(constructor));
    }

    /// Create a category by name
    pub fn create(&self, name: &str) -> Option<Box<dyn Category>> {
        self.constructors.get(name).map(|constructor| constructor())
    }

    /// Get all registered category names
    pub fn get_registered_names(&self) -> Vec<String> {
        self.constructors.keys().cloned().collect()
    }

    /// Create all registered categories
    pub fn create_all(&self) -> Vec<Box<dyn Category>> {
        self.constructors
            .values()
            .map(|constructor| constructor())
            .collect()
    }

    /// Register default categories
    fn register_defaults(&mut self) {
        // Register file operations category
        self.register("file_operations", || {
            Box::new(FileOperationsCategory::new())
        });

        // Register command execution category
        self.register("command_execution", || {
            Box::new(CommandExecutionCategory::new())
        });

        // Register general assistant category
        self.register("general_assistant", || {
            Box::new(GeneralAssistantCategory::new())
        });
    }
}

impl Default for CategoryFactory {
    fn default() -> Self {
        Self::new()
    }
}

/// Global category factory instance
static mut CATEGORY_FACTORY: Option<CategoryFactory> = None;
static INIT: std::sync::Once = std::sync::Once::new();

/// Get the global category factory instance
pub fn get_category_factory() -> &'static CategoryFactory {
    unsafe {
        INIT.call_once(|| {
            CATEGORY_FACTORY = Some(CategoryFactory::new());
        });
        CATEGORY_FACTORY.as_ref().unwrap()
    }
}

/// Create categories from a list of names
pub fn create_categories_from_names(names: &[&str]) -> Vec<Box<dyn Category>> {
    let factory = get_category_factory();
    names
        .iter()
        .filter_map(|name| factory.create(name))
        .collect()
}

/// Create all default categories
pub fn create_all_default_categories() -> Vec<Box<dyn Category>> {
    let factory = get_category_factory();
    factory.create_all()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_category_factory() {
        let factory = CategoryFactory::new();
        
        // Test creating categories
        let file_ops = factory.create("file_operations");
        assert!(file_ops.is_some());
        
        let cmd_exec = factory.create("command_execution");
        assert!(cmd_exec.is_some());
        
        let general = factory.create("general_assistant");
        assert!(general.is_some());
        
        // Test unknown category
        let unknown = factory.create("unknown");
        assert!(unknown.is_none());
    }

    #[test]
    fn test_create_all_categories() {
        let categories = create_all_default_categories();
        assert_eq!(categories.len(), 3);
        
        let names: Vec<String> = categories.iter().map(|c| c.name()).collect();
        assert!(names.contains(&"file_operations".to_string()));
        assert!(names.contains(&"command_execution".to_string()));
        assert!(names.contains(&"general_assistant".to_string()));
    }

    #[test]
    fn test_create_from_names() {
        let categories = create_categories_from_names(&["file_operations", "general_assistant"]);
        assert_eq!(categories.len(), 2);
    }
}
