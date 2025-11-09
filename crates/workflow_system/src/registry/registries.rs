//! Global registration tables for workflows and categories

use inventory;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use crate::types::{Category, Workflow, WorkflowDefinition};

/// Workflow registration information
pub struct WorkflowRegistration {
    /// The unique name of the workflow
    pub name: &'static str,
    /// Constructor function that creates a new instance of the workflow
    pub constructor: fn() -> Arc<dyn Workflow>,
}

/// Category registration information
pub struct CategoryRegistration {
    /// The unique ID of the category
    pub id: &'static str,
    /// Constructor function that creates a new instance of the category
    pub constructor: fn() -> Box<dyn Category>,
}

// Compile-time collection of all workflow and category registrations
inventory::collect!(WorkflowRegistration);
inventory::collect!(CategoryRegistration);

/// A thread-safe, caching registry for all workflows
#[derive(Debug)]
pub struct WorkflowRegistry {
    workflows: RwLock<HashMap<String, Arc<dyn Workflow>>>,
}

impl WorkflowRegistry {
    pub fn new() -> Self {
        let workflows = inventory::iter::<WorkflowRegistration>()
            .map(|reg| (reg.name.to_string(), (reg.constructor)()))
            .collect();
        Self {
            workflows: RwLock::new(workflows),
        }
    }

    /// Get a workflow by name
    pub fn get_workflow(&self, name: &str) -> Option<Arc<dyn Workflow>> {
        self.workflows.read().unwrap().get(name).cloned()
    }

    /// List all workflow definitions
    pub fn list_workflow_definitions(&self) -> Vec<WorkflowDefinition> {
        self.workflows
            .read()
            .unwrap()
            .values()
            .map(|workflow| workflow.definition())
            .collect()
    }

    /// List workflow definitions filtered by category
    pub fn list_workflows_by_category(&self, category: &str) -> Vec<WorkflowDefinition> {
        self.workflows
            .read()
            .unwrap()
            .values()
            .map(|workflow| workflow.definition())
            .filter(|def| def.category == category)
            .collect()
    }
}

impl Default for WorkflowRegistry {
    fn default() -> Self {
        Self::new()
    }
}

/// A thread-safe registry for all workflow categories
#[derive(Debug)]
pub struct CategoryRegistry {
    _categories: RwLock<HashMap<String, Box<dyn Category>>>,
}

impl CategoryRegistry {
    pub fn new() -> Self {
        let categories = inventory::iter::<CategoryRegistration>()
            .map(|reg| (reg.id.to_string(), (reg.constructor)()))
            .collect();
        Self {
            _categories: RwLock::new(categories),
        }
    }

    /// Get a category by ID
    pub fn get_category(&self, id: &str) -> Option<Box<dyn Category>> {
        if self._categories.read().unwrap().get(id).is_some() {
            // Clone the category trait object using the registered constructor
            inventory::iter::<CategoryRegistration>()
                .find(|reg| reg.id == id)
                .map(|reg| (reg.constructor)())
        } else {
            None
        }
    }

    /// List all categories
    pub fn list_categories(&self) -> Vec<Box<dyn Category>> {
        inventory::iter::<CategoryRegistration>()
            .map(|reg| (reg.constructor)())
            .collect()
    }
}

impl Default for CategoryRegistry {
    fn default() -> Self {
        Self::new()
    }
}






