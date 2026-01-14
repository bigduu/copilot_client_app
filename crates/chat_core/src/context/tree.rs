//! ContextTree - Parent-child relationships between contexts
//!
//! Tracks the hierarchy of contexts for sub-task management.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::agent::AgentRole;

/// Maximum depth for sub-context nesting (0 = root, max = 4)
pub const MAX_CONTEXT_DEPTH: u8 = 4;

/// Tracks parent-child relationships between contexts
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ContextTree {
    /// Parent context ID (None if this is a root context)
    pub parent_id: Option<Uuid>,

    /// Which TodoItem in the parent spawned this context
    pub parent_todo_item_id: Option<Uuid>,

    /// Child contexts spawned from this context
    pub children: Vec<ChildContextRef>,

    /// Nesting depth (0 = root context)
    pub depth: u8,
}

impl ContextTree {
    /// Create a root context tree (no parent)
    pub fn root() -> Self {
        Self {
            parent_id: None,
            parent_todo_item_id: None,
            children: Vec::new(),
            depth: 0,
        }
    }

    /// Create a child context tree
    pub fn child(parent_id: Uuid, parent_todo_item_id: Uuid, parent_depth: u8) -> Self {
        Self {
            parent_id: Some(parent_id),
            parent_todo_item_id: Some(parent_todo_item_id),
            children: Vec::new(),
            depth: parent_depth.saturating_add(1),
        }
    }

    /// Check if this context can create child contexts
    pub fn can_create_child(&self) -> bool {
        self.depth < MAX_CONTEXT_DEPTH
    }

    /// Get the depth a child would have
    pub fn child_depth(&self) -> u8 {
        self.depth.saturating_add(1)
    }

    /// Add a child context reference
    pub fn add_child(&mut self, child: ChildContextRef) {
        self.children.push(child);
    }

    /// Get a child by context ID
    pub fn get_child(&self, context_id: Uuid) -> Option<&ChildContextRef> {
        self.children.iter().find(|c| c.context_id == context_id)
    }

    /// Check if this is a root context
    pub fn is_root(&self) -> bool {
        self.parent_id.is_none()
    }
}

/// Reference to a child context
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChildContextRef {
    /// ID of the child context
    pub context_id: Uuid,

    /// ID of the TodoItem that created this child
    pub todo_item_id: Uuid,

    /// Role assigned to the child context
    pub role: AgentRole,

    /// Optional title for the child context
    pub title: Option<String>,

    /// When the child was created
    pub created_at: DateTime<Utc>,
}

impl ChildContextRef {
    /// Create a new child reference
    pub fn new(context_id: Uuid, todo_item_id: Uuid, role: AgentRole) -> Self {
        Self {
            context_id,
            todo_item_id,
            role,
            title: None,
            created_at: Utc::now(),
        }
    }

    /// Create with a title
    pub fn with_title(mut self, title: impl Into<String>) -> Self {
        self.title = Some(title.into());
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_context_tree_depth() {
        let root = ContextTree::root();
        assert_eq!(root.depth, 0);
        assert!(root.can_create_child());

        let child = ContextTree::child(Uuid::new_v4(), Uuid::new_v4(), root.depth);
        assert_eq!(child.depth, 1);
        assert!(child.can_create_child());
    }

    #[test]
    fn test_max_depth() {
        let tree = ContextTree {
            depth: MAX_CONTEXT_DEPTH + 1,
            ..Default::default()
        };
        assert!(!tree.can_create_child());
    }
}
