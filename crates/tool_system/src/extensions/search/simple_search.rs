use crate::{
    registry::macros::auto_register_tool,
    types::{
        DisplayPreference, Parameter, Tool, ToolArguments, ToolDefinition, ToolError, ToolType, ToolPermission,
    },
};
use anyhow::Context;
use async_trait::async_trait;
use serde_json::json;
use std::fs;
use std::path::Path;

// Simple search tool - uses regex for parameter extraction
#[derive(Debug)]
pub struct SimpleSearchTool;

impl SimpleSearchTool {
    pub const TOOL_NAME: &'static str = "search";

    pub fn new() -> Self {
        Self
    }
}

impl Default for SimpleSearchTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for SimpleSearchTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: Self::TOOL_NAME.to_string(),
            description: "Search for files or content. Usage: /search <query>".to_string(),
            parameters: vec![Parameter {
                name: "query".to_string(),
                description: "The search query".to_string(),
                required: true,
            }],
            requires_approval: false,
            tool_type: ToolType::RegexParameterExtraction,
            parameter_regex: Some(r"^/search\s+(.+)$".to_string()),
            custom_prompt: Some(
                r#"
Please format your response as follows:

1. **Search Summary**: Briefly explain what was searched for
2. **Results Found**: Summarize the number and types of files found
3. **Key Findings**: Highlight the most relevant results
4. **Suggestions**: If appropriate, suggest next steps or related searches

Keep your response concise and user-friendly."#
                    .to_string(),
            ),
            hide_in_selector: true,
            display_preference: DisplayPreference::Default,
            termination_behavior_doc: Some(
                "Use terminate=false if you need to perform additional actions on the search results (e.g., read found files). \
                 Use terminate=true if you're ready to present the search results to the user without further actions."
                    .to_string()
            ),
            required_permissions: vec![ToolPermission::ReadFiles],
        }
    }

    async fn execute(&self, args: ToolArguments) -> Result<serde_json::Value, ToolError> {
        let query = match args {
            ToolArguments::String(query) => query,
            _ => return Err(ToolError::InvalidArguments("Expected a single string query".to_string())),
        };

        // Simple file search implementation
        let current_dir = std::env::current_dir()
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;

        let mut results = Vec::new();
        search_in_directory(&current_dir, &query, &mut results, 0)
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;

        if results.is_empty() {
            Ok(json!({
                "status": "success",
                "message": format!("No files found matching '{}'", query)
            }))
        } else {
            let result_count = results.len();
            let result_text = results
                .into_iter()
                .take(20) // Limit result count
                .collect::<Vec<_>>()
                .join("\n");
            Ok(json!({
                "status": "success",
                "message": format!("Found {} matches:\n{}", std::cmp::min(20, result_count), result_text)
            }))
        }
    }
}

fn search_in_directory(
    dir: &Path,
    query: &str,
    results: &mut Vec<String>,
    depth: usize,
) -> Result<(), anyhow::Error> {
    // Limit search depth
    if depth > 3 {
        return Ok(());
    }

    // Limit result count
    if results.len() >= 20 {
        return Ok(());
    }

    let entries = fs::read_dir(dir)
        .with_context(|| format!("Failed to read directory: {}", dir.display()))?;

    for entry in entries {
        let entry = entry?;
        let path = entry.path();
        let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

        // Skip hidden files and common ignored directories
        if file_name.starts_with('.')
            || file_name == "node_modules"
            || file_name == "target"
            || file_name == "dist"
        {
            continue;
        }

        // Check if filename matches query
        if file_name.to_lowercase().contains(&query.to_lowercase()) {
            results.push(path.display().to_string());
        }

        // If it's a directory, search recursively
        if path.is_dir() {
            search_in_directory(&path, query, results, depth + 1)?;
        }
    }

    Ok(())
}

// Auto-register the tool
auto_register_tool!(SimpleSearchTool);
