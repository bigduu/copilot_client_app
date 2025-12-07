use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use log::{info, warn};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// Metadata about a workflow file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowMetadata {
    pub name: String,
    pub filename: String,
    pub source: WorkflowSource,
    pub created_at: Option<DateTime<Utc>>,
    pub modified_at: Option<DateTime<Utc>>,
    pub size: u64,
}

/// Source location of the workflow
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum WorkflowSource {
    Global,
    Workspace,
}

/// Full workflow content with metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowContent {
    pub name: String,
    pub content: String,
    pub metadata: WorkflowMetadata,
}

/// Service for managing workflow markdown files
pub struct WorkflowManagerService {
    global_workflows_path: PathBuf,
}

impl WorkflowManagerService {
    /// Create a new workflow manager service
    pub fn new(global_workflows_path: PathBuf) -> Self {
        // Create global workflows directory if it doesn't exist
        if let Err(e) = fs::create_dir_all(&global_workflows_path) {
            warn!(
                "Failed to create global workflows directory: {:?}, error: {}",
                global_workflows_path, e
            );
        }

        Self {
            global_workflows_path,
        }
    }

    /// List all workflows from both global and workspace locations
    /// Workspace workflows override global ones with the same name
    pub fn list_workflows(&self, workspace_path: Option<&Path>) -> Result<Vec<WorkflowMetadata>> {
        let mut workflows = Vec::new();

        // Read global workflows
        if let Ok(global_workflows) =
            self.read_workflows_from_dir(&self.global_workflows_path, WorkflowSource::Global)
        {
            workflows.extend(global_workflows);
        }

        // Read workspace workflows if path is provided
        if let Some(workspace) = workspace_path {
            let workspace_workflows_path = workspace.join(".workflows");
            if workspace_workflows_path.exists() {
                if let Ok(workspace_workflows) = self
                    .read_workflows_from_dir(&workspace_workflows_path, WorkflowSource::Workspace)
                {
                    // Workspace workflows override global ones
                    workflows.extend(workspace_workflows);
                }
            }
        }

        // Remove duplicates, keeping workspace version if both exist
        let mut unique_workflows: std::collections::HashMap<String, WorkflowMetadata> =
            std::collections::HashMap::new();
        for workflow in workflows {
            unique_workflows
                .entry(workflow.name.clone())
                .and_modify(|existing| {
                    // Workspace takes precedence over global
                    if workflow.source == WorkflowSource::Workspace {
                        *existing = workflow.clone();
                    }
                })
                .or_insert(workflow);
        }

        let mut result: Vec<WorkflowMetadata> = unique_workflows.into_values().collect();
        result.sort_by(|a, b| a.name.cmp(&b.name));

        Ok(result)
    }

    /// Get a specific workflow by name
    /// Checks workspace first, then global
    pub fn get_workflow(
        &self,
        name: &str,
        workspace_path: Option<&Path>,
    ) -> Result<WorkflowContent> {
        // Try workspace first if path is provided
        if let Some(workspace) = workspace_path {
            let workspace_workflows_path = workspace.join(".workflows");
            let workspace_file = workspace_workflows_path.join(format!("{}.md", name));

            if workspace_file.exists() {
                return self.read_workflow_file(&workspace_file, name, WorkflowSource::Workspace);
            }
        }

        // Fall back to global
        let global_file = self.global_workflows_path.join(format!("{}.md", name));
        if global_file.exists() {
            return self.read_workflow_file(&global_file, name, WorkflowSource::Global);
        }

        Err(anyhow!("Workflow '{}' not found", name))
    }

    /// Create a new workflow
    pub fn create_workflow(
        &self,
        name: &str,
        content: &str,
        source: WorkflowSource,
        workspace_path: Option<&Path>,
    ) -> Result<()> {
        let target_dir = self.get_target_directory(source, workspace_path)?;
        let file_path = target_dir.join(format!("{}.md", name));

        if file_path.exists() {
            return Err(anyhow!("Workflow '{}' already exists", name));
        }

        fs::create_dir_all(&target_dir)?;
        fs::write(&file_path, content)?;

        info!("Created workflow '{}' at {:?}", name, file_path);
        Ok(())
    }

    /// Update an existing workflow
    pub fn update_workflow(
        &self,
        name: &str,
        content: &str,
        workspace_path: Option<&Path>,
    ) -> Result<()> {
        // Find the workflow to determine its source
        let workflow = self.get_workflow(name, workspace_path)?;
        let target_dir = self.get_target_directory(workflow.metadata.source, workspace_path)?;
        let file_path = target_dir.join(format!("{}.md", name));

        if !file_path.exists() {
            return Err(anyhow!("Workflow '{}' not found", name));
        }

        fs::write(&file_path, content)?;

        info!("Updated workflow '{}' at {:?}", name, file_path);
        Ok(())
    }

    /// Delete a workflow
    pub fn delete_workflow(
        &self,
        name: &str,
        source: WorkflowSource,
        workspace_path: Option<&Path>,
    ) -> Result<()> {
        let target_dir = self.get_target_directory(source.clone(), workspace_path)?;
        let file_path = target_dir.join(format!("{}.md", name));

        if !file_path.exists() {
            return Err(anyhow!(
                "Workflow '{}' not found in {:?} location",
                name,
                source
            ));
        }

        fs::remove_file(&file_path)?;

        info!("Deleted workflow '{}' from {:?}", name, file_path);
        Ok(())
    }

    /// Initialize default workflow templates in global directory
    pub fn initialize_default_workflows(&self) -> Result<()> {
        let example_workflow = r#"# Example Workflow

This is a simple example workflow to demonstrate the workflow system.

## Steps

1. First, say hello to the user
2. Then, tell a long and interesting story about AI and technology

## Description

This workflow demonstrates how AI can execute multi-step tasks:
- Start with a friendly greeting
- Follow with engaging content
- All while tracking progress with a TODO list

Feel free to customize this workflow or create your own!
"#;

        let example_path = self.global_workflows_path.join("example.md");

        if !example_path.exists() {
            fs::write(&example_path, example_workflow)?;
            info!("Created default workflow: example.md");
        }

        Ok(())
    }

    // Private helper methods

    fn read_workflows_from_dir(
        &self,
        dir: &Path,
        source: WorkflowSource,
    ) -> Result<Vec<WorkflowMetadata>> {
        let mut workflows = Vec::new();

        if !dir.exists() {
            return Ok(workflows);
        }

        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();

            if path.extension().and_then(|s| s.to_str()) == Some("md") {
                if let Some(name) = path.file_stem().and_then(|s| s.to_str()) {
                    let metadata = entry.metadata()?;

                    workflows.push(WorkflowMetadata {
                        name: name.to_string(),
                        filename: path.file_name().unwrap().to_string_lossy().to_string(),
                        source: source.clone(),
                        created_at: metadata.created().ok().map(|t| t.into()),
                        modified_at: metadata.modified().ok().map(|t| t.into()),
                        size: metadata.len(),
                    });
                }
            }
        }

        Ok(workflows)
    }

    fn read_workflow_file(
        &self,
        path: &Path,
        name: &str,
        source: WorkflowSource,
    ) -> Result<WorkflowContent> {
        let content = fs::read_to_string(path)?;
        let metadata_sys = fs::metadata(path)?;

        Ok(WorkflowContent {
            name: name.to_string(),
            content,
            metadata: WorkflowMetadata {
                name: name.to_string(),
                filename: path.file_name().unwrap().to_string_lossy().to_string(),
                source,
                created_at: metadata_sys.created().ok().map(|t| t.into()),
                modified_at: metadata_sys.modified().ok().map(|t| t.into()),
                size: metadata_sys.len(),
            },
        })
    }

    fn get_target_directory(
        &self,
        source: WorkflowSource,
        workspace_path: Option<&Path>,
    ) -> Result<PathBuf> {
        match source {
            WorkflowSource::Global => Ok(self.global_workflows_path.clone()),
            WorkflowSource::Workspace => {
                let workspace = workspace_path
                    .ok_or_else(|| anyhow!("Workspace path required for workspace workflows"))?;
                Ok(workspace.join(".workflows"))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_create_and_list_workflows() {
        let temp_dir = TempDir::new().unwrap();
        let service = WorkflowManagerService::new(temp_dir.path().to_path_buf());

        service
            .create_workflow("test", "# Test Workflow", WorkflowSource::Global, None)
            .unwrap();

        let workflows = service.list_workflows(None).unwrap();
        assert_eq!(workflows.len(), 1);
        assert_eq!(workflows[0].name, "test");
    }

    #[test]
    fn test_get_workflow() {
        let temp_dir = TempDir::new().unwrap();
        let service = WorkflowManagerService::new(temp_dir.path().to_path_buf());

        let content = "# Test Workflow\n\nThis is a test.";
        service
            .create_workflow("test", content, WorkflowSource::Global, None)
            .unwrap();

        let workflow = service.get_workflow("test", None).unwrap();
        assert_eq!(workflow.name, "test");
        assert_eq!(workflow.content, content);
    }

    #[test]
    fn test_workspace_override() {
        let global_dir = TempDir::new().unwrap();
        let workspace_dir = TempDir::new().unwrap();
        let service = WorkflowManagerService::new(global_dir.path().to_path_buf());

        // Create global workflow
        service
            .create_workflow("test", "# Global", WorkflowSource::Global, None)
            .unwrap();

        // Create workspace workflow with same name
        service
            .create_workflow(
                "test",
                "# Workspace",
                WorkflowSource::Workspace,
                Some(workspace_dir.path()),
            )
            .unwrap();

        // Workspace should override
        let workflow = service
            .get_workflow("test", Some(workspace_dir.path()))
            .unwrap();
        assert_eq!(workflow.content, "# Workspace");
        assert_eq!(workflow.metadata.source, WorkflowSource::Workspace);
    }
}
