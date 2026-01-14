//! SubTaskScope - Defines limitations for sub-task contexts
//!
//! Controls what a child context can do.

use serde::{Deserialize, Serialize};

/// Scope limitations for a sub-task context
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct SubTaskScope {
    /// Which tools are allowed in this sub-context (None = all tools)
    pub allowed_tools: Option<Vec<String>>,

    /// Inherit workspace path from parent
    #[serde(default = "default_true")]
    pub inherit_workspace: bool,

    /// Remaining depth for nested sub-contexts
    #[serde(default = "default_remaining_depth")]
    pub remaining_depth: u8,
}

fn default_true() -> bool {
    true
}

fn default_remaining_depth() -> u8 {
    3 // Default: can create 3 more levels of nesting
}

impl Default for SubTaskScope {
    fn default() -> Self {
        Self {
            allowed_tools: None,
            inherit_workspace: default_true(),
            remaining_depth: default_remaining_depth(),
        }
    }
}

impl SubTaskScope {
    /// Create a new scope with full access
    pub fn new() -> Self {
        Self::default()
    }

    /// Create a scope with tool restrictions
    pub fn with_tools(tools: Vec<String>) -> Self {
        Self {
            allowed_tools: Some(tools),
            ..Default::default()
        }
    }

    /// Check if a tool is allowed
    pub fn is_tool_allowed(&self, tool_name: &str) -> bool {
        match &self.allowed_tools {
            None => true, // No restrictions
            Some(allowed) => allowed.iter().any(|t| t == tool_name),
        }
    }

    /// Check if more nesting is allowed
    pub fn can_nest(&self) -> bool {
        self.remaining_depth > 0
    }

    /// Create a child scope with decremented depth
    pub fn child_scope(&self) -> Option<Self> {
        if !self.can_nest() {
            return None;
        }
        Some(Self {
            allowed_tools: self.allowed_tools.clone(),
            inherit_workspace: self.inherit_workspace,
            remaining_depth: self.remaining_depth - 1,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scope_nesting() {
        let scope = SubTaskScope::new();
        assert!(scope.can_nest());

        let child = scope.child_scope().unwrap();
        assert_eq!(child.remaining_depth, 2);
    }

    #[test]
    fn test_tool_restriction() {
        let scope = SubTaskScope::with_tools(vec!["read_file".to_string()]);
        assert!(scope.is_tool_allowed("read_file"));
        assert!(!scope.is_tool_allowed("write_file"));
    }
}
