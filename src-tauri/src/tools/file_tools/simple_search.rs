use crate::tools::{Parameter, Tool, ToolType};
use anyhow::{Context, Result};
use async_trait::async_trait;
use std::fs;
use std::path::Path;

// Simple search tool - uses regex for parameter extraction
#[derive(Debug)]
pub struct SimpleSearchTool;

#[async_trait]
impl Tool for SimpleSearchTool {
    fn name(&self) -> String {
        "search".to_string()
    }

    fn description(&self) -> String {
        "Search for files or content. Usage: /search <query>".to_string()
    }

    fn parameters(&self) -> Vec<Parameter> {
        vec![Parameter {
            name: "query".to_string(),
            description: "The search query".to_string(),
            required: true,
            value: "".to_string(),
        }]
    }

    fn required_approval(&self) -> bool {
        false
    }

    fn tool_type(&self) -> ToolType {
        ToolType::RegexParameterExtraction
    }

    fn categories(&self) -> Vec<crate::tools::tool_types::CategoryId> {
        vec![crate::tools::tool_types::CategoryId::FileOperations]
    }

    fn parameter_regex(&self) -> Option<String> {
        // Match all content after /search as query parameter
        Some(r"^/search\s+(.+)$".to_string())
    }

    fn custom_prompt(&self) -> Option<String> {
        Some(
            r#"
Please format your response as follows:

1. **Search Summary**: Briefly explain what was searched for
2. **Results Found**: Summarize the number and types of files found
3. **Key Findings**: Highlight the most relevant results
4. **Suggestions**: If appropriate, suggest next steps or related searches

Keep your response concise and user-friendly."#
                .to_string(),
        )
    }

    async fn execute(&self, parameters: Vec<Parameter>) -> Result<String> {
        let mut query = String::new();

        for param in parameters {
            if param.name == "query" {
                query = param.value;
            }
        }

        if query.is_empty() {
            return Err(anyhow::anyhow!("Query parameter is required"));
        }

        // Simple file search implementation
        let current_dir =
            std::env::current_dir().with_context(|| "Failed to get current directory")?;

        let mut results = Vec::new();
        search_in_directory(&current_dir, &query, &mut results, 0)?;

        if results.is_empty() {
            Ok(format!("No files found matching '{}'", query))
        } else {
            let result_count = results.len();
            let result_text = results
                .into_iter()
                .take(20) // Limit result count
                .collect::<Vec<_>>()
                .join("\n");
            Ok(format!(
                "Found {} matches:\n{}",
                std::cmp::min(20, result_count),
                result_text
            ))
        }
    }
}

fn search_in_directory(
    dir: &Path,
    query: &str,
    results: &mut Vec<String>,
    depth: usize,
) -> Result<()> {
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
