//! Bitbucket Tool
//!
//! Tool for accessing company Bitbucket repositories, pull requests, etc.

use anyhow::Result;
use async_trait::async_trait;
use serde_json::json;

use crate::extension_system::{auto_register_tool, Parameter, Tool, ToolType};

/// Bitbucket access tool for company repositories
#[derive(Debug)]
pub struct BitbucketTool;

impl BitbucketTool {
    pub const TOOL_NAME: &'static str = "bitbucket";

    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl Tool for BitbucketTool {
    fn name(&self) -> String {
        Self::TOOL_NAME.to_string()
    }

    fn description(&self) -> String {
        "Access company Bitbucket repositories, search code, view pull requests, and manage repository operations".to_string()
    }

    fn parameters(&self) -> Vec<Parameter> {
        vec![
            Parameter {
                name: "action".to_string(),
                description: "The action to perform (search_repos, search_code, get_pr, list_prs, get_repo_info)".to_string(),
                required: true,
                value: "".to_string(),
            },
            Parameter {
                name: "query".to_string(),
                description: "Search query or repository name".to_string(),
                required: false,
                value: "".to_string(),
            },
            Parameter {
                name: "repository".to_string(),
                description: "Repository name (format: project/repo)".to_string(),
                required: false,
                value: "".to_string(),
            },
            Parameter {
                name: "pr_id".to_string(),
                description: "Pull request ID (for PR-specific actions)".to_string(),
                required: false,
                value: "".to_string(),
            },
        ]
    }

    fn required_approval(&self) -> bool {
        false // Read-only operations don't require approval
    }

    fn tool_type(&self) -> ToolType {
        ToolType::AIParameterParsing
    }

    fn hide_in_selector(&self) -> bool {
        true // Hide internal company tools from user selector
    }

    async fn execute(&self, parameters: Vec<Parameter>) -> Result<String> {
        let mut action = String::new();
        let mut query = String::new();
        let mut repository = String::new();
        let mut pr_id = String::new();

        for param in parameters {
            match param.name.as_str() {
                "action" => action = param.value,
                "query" => query = param.value,
                "repository" => repository = param.value,
                "pr_id" => pr_id = param.value,
                _ => (),
            }
        }

        if action.is_empty() {
            return Err(anyhow::anyhow!("Action parameter is required"));
        }

        match action.as_str() {
            "search_repos" => self.search_repositories(&query).await,
            "search_code" => self.search_code(&query, &repository).await,
            "get_pr" => self.get_pull_request(&repository, &pr_id).await,
            "list_prs" => self.list_pull_requests(&repository).await,
            "get_repo_info" => self.get_repository_info(&repository).await,
            _ => Err(anyhow::anyhow!("Unknown action: {}", action)),
        }
    }
}

impl BitbucketTool {
    async fn search_repositories(&self, query: &str) -> Result<String> {
        // Mock implementation - in real environment this would call Bitbucket API
        let result = json!({
            "action": "search_repositories",
            "query": query,
            "results": [
                {
                    "name": "example-project/main-app",
                    "description": "Main application repository",
                    "language": "Rust",
                    "updated": "2024-01-15"
                },
                {
                    "name": "example-project/frontend",
                    "description": "Frontend application",
                    "language": "TypeScript",
                    "updated": "2024-01-14"
                }
            ]
        });

        Ok(format!(
            "Repository search results:\n{}",
            serde_json::to_string_pretty(&result)?
        ))
    }

    async fn search_code(&self, query: &str, repository: &str) -> Result<String> {
        let result = json!({
            "action": "search_code",
            "query": query,
            "repository": repository,
            "results": [
                {
                    "file": "src/main.rs",
                    "line": 42,
                    "content": "// Code snippet containing the search term",
                    "url": "https://bitbucket.company.com/projects/PROJ/repos/repo/browse/src/main.rs#42"
                }
            ]
        });

        Ok(format!(
            "Code search results:\n{}",
            serde_json::to_string_pretty(&result)?
        ))
    }

    async fn get_pull_request(&self, repository: &str, pr_id: &str) -> Result<String> {
        let result = json!({
            "action": "get_pull_request",
            "repository": repository,
            "pr_id": pr_id,
            "title": "Feature: Add new functionality",
            "author": "developer@company.com",
            "status": "OPEN",
            "created": "2024-01-15T10:00:00Z",
            "description": "This PR adds new functionality to the application..."
        });

        Ok(format!(
            "Pull request details:\n{}",
            serde_json::to_string_pretty(&result)?
        ))
    }

    async fn list_pull_requests(&self, repository: &str) -> Result<String> {
        let result = json!({
            "action": "list_pull_requests",
            "repository": repository,
            "pull_requests": [
                {
                    "id": "123",
                    "title": "Feature: Add new functionality",
                    "author": "developer@company.com",
                    "status": "OPEN"
                },
                {
                    "id": "122",
                    "title": "Fix: Bug in authentication",
                    "author": "another@company.com",
                    "status": "MERGED"
                }
            ]
        });

        Ok(format!(
            "Pull requests:\n{}",
            serde_json::to_string_pretty(&result)?
        ))
    }

    async fn get_repository_info(&self, repository: &str) -> Result<String> {
        let result = json!({
            "action": "get_repository_info",
            "repository": repository,
            "description": "Main application repository",
            "language": "Rust",
            "size": "15.2 MB",
            "last_updated": "2024-01-15T14:30:00Z",
            "branches": ["main", "develop", "feature/new-ui"],
            "contributors": 12
        });

        Ok(format!(
            "Repository information:\n{}",
            serde_json::to_string_pretty(&result)?
        ))
    }
}

// Auto-register the tool
auto_register_tool!(BitbucketTool);
