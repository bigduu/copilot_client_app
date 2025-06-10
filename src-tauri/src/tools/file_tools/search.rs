use crate::tools::{Parameter, Tool, ToolType};
use anyhow::Result;
use async_trait::async_trait;
use std::fs;
use walkdir::WalkDir;

// File search tool
#[derive(Debug)]
pub struct SearchFilesTool;

#[async_trait]
impl Tool for SearchFilesTool {
    fn name(&self) -> String {
        "search_files".to_string()
    }

    fn description(&self) -> String {
        "Searches for files matching a pattern and/or containing specific text".to_string()
    }

    fn parameters(&self) -> Vec<Parameter> {
        vec![
            Parameter {
                name: "path".to_string(),
                description: "The base path to search in".to_string(),
                required: true,
                value: "".to_string(),
            },
            Parameter {
                name: "pattern".to_string(),
                description: "File pattern to match (e.g., '*.rs', optional)".to_string(),
                required: false,
                value: "".to_string(),
            },
            Parameter {
                name: "content".to_string(),
                description: "Text content to search for within files (optional)".to_string(),
                required: false,
                value: "".to_string(),
            },
        ]
    }

    fn required_approval(&self) -> bool {
        false
    }

    fn tool_type(&self) -> ToolType {
        ToolType::AIParameterParsing
    }

    async fn execute(&self, parameters: Vec<Parameter>) -> Result<String> {
        let mut path = String::new();
        let mut pattern = String::new();
        let mut content = String::new();

        for param in parameters {
            match param.name.as_str() {
                "path" => path = param.value,
                "pattern" => pattern = param.value,
                "content" => content = param.value,
                _ => (),
            }
        }

        if path.is_empty() {
            return Err(anyhow::anyhow!("Path parameter is required"));
        }

        let mut results = Vec::new();

        // Walk the directory tree
        for entry in WalkDir::new(&path).into_iter().filter_map(Result::ok) {
            let entry_path = entry.path();
            if !entry_path.is_file() {
                continue;
            }

            let file_name = entry_path.file_name().unwrap().to_string_lossy();

            // Check if the file matches the pattern
            if !pattern.is_empty() {
                let pattern_matches = if pattern.contains('*') {
                    // Simple glob-like matching
                    let pattern_parts: Vec<&str> = pattern.split('*').collect();
                    if pattern_parts.is_empty() {
                        true
                    } else {
                        let file_name_str = file_name.to_string();
                        pattern_parts.iter().enumerate().all(|(i, part)| {
                            if i == 0 && !pattern.starts_with('*') {
                                file_name_str.starts_with(part)
                            } else if i == pattern_parts.len() - 1 && !pattern.ends_with('*') {
                                file_name_str.ends_with(part)
                            } else {
                                file_name_str.contains(part)
                            }
                        })
                    }
                } else {
                    file_name.contains(&pattern)
                };

                if !pattern_matches {
                    continue;
                }
            }

            // If content search is specified, check file contents
            if !content.is_empty() {
                // Try to read the file content
                if let Ok(file_content) = fs::read_to_string(entry_path) {
                    if !file_content.contains(&content) {
                        continue;
                    }
                } else {
                    // If we can't read the file, skip it
                    continue;
                }
            }

            // Add the matching file to results
            results.push(entry_path.to_string_lossy().to_string());
        }

        if results.is_empty() {
            Ok("No files found matching the criteria".to_string())
        } else {
            Ok(format!(
                "Found {} matching files:\n{}",
                results.len(),
                results.join("\n")
            ))
        }
    }
}
