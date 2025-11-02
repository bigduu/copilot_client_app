//! Category definitions for workflows

use serde::{Deserialize, Serialize};

/// A category for organizing workflows in the UI
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowCategory {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: Option<String>,
}

/// Trait for workflow category definitions
pub trait Category: std::fmt::Debug + Send + Sync {
    /// Returns the category metadata
    fn metadata(&self) -> WorkflowCategory;
}

