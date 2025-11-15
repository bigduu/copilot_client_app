//! Tool category enum for internal classification.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ToolCategory {
    /// Tools for reading files.
    FileReading,
    /// Tools for writing or modifying files.
    FileWriting,
    /// Tools for searching and discovering files or content.
    SearchAndDiscovery,
    /// Tools for executing shell commands.
    CommandExecution,
    /// General-purpose tools.
    General,
}

impl Default for ToolCategory {
    fn default() -> Self {
        Self::General
    }
}
