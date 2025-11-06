use serde::{Deserialize, Serialize};

/// Agent role defines the permissions and behavior of the agent.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum AgentRole {
    /// Read-only planning role: can read files, search code, list directories
    Planner,
    /// Full permissions execution role: can read, write, create, delete files and execute commands
    #[default]
    Actor,
    // Future roles can be added here: Commander, Designer, Reviewer, Tester, etc.
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
        }
    }

    /// Checks if this role has a specific permission.
    pub fn has_permission(&self, permission: &Permission) -> bool {
        self.permissions().contains(permission)
    }
}
