//! Project structure message types

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Project structure message
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProjectStructMsg {
    /// Root path of the project
    pub root_path: PathBuf,

    /// Type of structure representation
    pub structure_type: StructureType,

    /// The actual structure content
    pub content: ProjectStructureContent,

    /// When this structure was generated
    pub generated_at: DateTime<Utc>,

    /// Patterns to exclude (e.g., ".git", "node_modules")
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub excluded_patterns: Vec<String>,
}

/// Type of project structure representation
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum StructureType {
    /// Tree representation (hierarchical)
    Tree,
    /// Flat file list
    FileList,
    /// Dependency graph
    Dependencies,
}

/// Project structure content variants
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "format", content = "data", rename_all = "snake_case")]
pub enum ProjectStructureContent {
    Tree(DirectoryNode),
    FileList(Vec<FileInfo>),
    Dependencies(DependencyGraph),
}

/// Directory node in tree structure
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DirectoryNode {
    pub name: String,
    pub path: PathBuf,
    pub children: Vec<DirectoryNode>,
    pub files: Vec<FileInfo>,
}

/// File information
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FileInfo {
    pub path: PathBuf,
    pub size_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
}

/// Dependency graph
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DependencyGraph {
    pub dependencies: Vec<Dependency>,
}

/// Single dependency
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Dependency {
    pub name: String,
    pub version: String,
    pub dep_type: DependencyType,
}

/// Dependency type
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DependencyType {
    Direct,
    Transitive,
    Dev,
    Build,
}
