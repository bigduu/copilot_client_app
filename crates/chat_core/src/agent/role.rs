//! AgentRole - Defines permissions and behavior of the agent
//!
//! Roles control what tools are available and what actions are permitted.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::scope::SubTaskScope;

/// Agent role defines the permissions and behavior of the agent.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(tag = "role", rename_all = "snake_case")]
pub enum AgentRole {
    /// Read-only planning role: can read files, search code, list directories
    Planner,

    /// Full permissions execution role: can read, write, create, delete files and execute commands
    #[default]
    Actor,

    /// Child context with scoped permissions
    SubTaskActor {
        /// ID of the parent context
        parent_context_id: Uuid,
        /// Scope limitations for this sub-task
        scope: SubTaskScope,
    },
}

impl AgentRole {
    /// Returns the set of permissions granted to this role.
    pub fn permissions(&self) -> Vec<Permission> {
        match self {
            AgentRole::Planner => vec![Permission::ReadFiles],
            AgentRole::Actor => vec![
                Permission::ReadFiles,
                Permission::WriteFiles,
                Permission::CreateFiles,
                Permission::DeleteFiles,
                Permission::ExecuteCommands,
            ],
            AgentRole::SubTaskActor { scope, .. } => {
                // SubTaskActor inherits actor permissions unless restricted
                if scope.allowed_tools.is_some() {
                    // If tools are restricted, only give read access
                    vec![Permission::ReadFiles]
                } else {
                    vec![
                        Permission::ReadFiles,
                        Permission::WriteFiles,
                        Permission::CreateFiles,
                        Permission::ExecuteCommands,
                    ]
                }
            }
        }
    }

    /// Checks if this role has a specific permission.
    pub fn has_permission(&self, permission: &Permission) -> bool {
        self.permissions().contains(permission)
    }

    /// Check if this is a sub-task role
    pub fn is_sub_task(&self) -> bool {
        matches!(self, Self::SubTaskActor { .. })
    }

    /// Get parent context ID if this is a sub-task
    pub fn parent_context_id(&self) -> Option<Uuid> {
        match self {
            Self::SubTaskActor {
                parent_context_id, ..
            } => Some(*parent_context_id),
            _ => None,
        }
    }
}

/// Permission types for agent operations.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum Permission {
    ReadFiles,
    WriteFiles,
    CreateFiles,
    DeleteFiles,
    ExecuteCommands,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_actor_has_all_permissions() {
        let role = AgentRole::Actor;
        assert!(role.has_permission(&Permission::ReadFiles));
        assert!(role.has_permission(&Permission::WriteFiles));
        assert!(role.has_permission(&Permission::ExecuteCommands));
    }

    #[test]
    fn test_planner_read_only() {
        let role = AgentRole::Planner;
        assert!(role.has_permission(&Permission::ReadFiles));
        assert!(!role.has_permission(&Permission::WriteFiles));
    }
}
