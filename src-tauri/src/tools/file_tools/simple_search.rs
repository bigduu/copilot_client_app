use crate::tools::{Parameter, Tool, ToolType};
use anyhow::{Context, Result};
use async_trait::async_trait;
use std::fs;
use std::path::Path;

// 简单搜索工具 - 使用正则提取参数
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

    fn parameter_regex(&self) -> Option<String> {
        // 匹配 /search 后面的所有内容作为查询参数
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

        // 简单的文件搜索实现
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
                .take(20) // 限制结果数量
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
    // 限制搜索深度
    if depth > 3 {
        return Ok(());
    }

    // 限制结果数量
    if results.len() >= 20 {
        return Ok(());
    }

    let entries = fs::read_dir(dir)
        .with_context(|| format!("Failed to read directory: {}", dir.display()))?;

    for entry in entries {
        let entry = entry?;
        let path = entry.path();
        let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

        // 跳过隐藏文件和常见的忽略目录
        if file_name.starts_with('.')
            || file_name == "node_modules"
            || file_name == "target"
            || file_name == "dist"
        {
            continue;
        }

        // 检查文件名是否匹配查询
        if file_name.to_lowercase().contains(&query.to_lowercase()) {
            results.push(path.display().to_string());
        }

        // 如果是目录，递归搜索
        if path.is_dir() {
            search_in_directory(&path, query, results, depth + 1)?;
        }
    }

    Ok(())
}
