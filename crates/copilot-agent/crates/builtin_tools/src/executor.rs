use async_trait::async_trait;
use copilot_agent_core::tools::{ToolCall, ToolError, ToolExecutor, ToolResult, ToolSchema};
use serde_json::json;

use crate::tools::{CommandTool, FilesystemTool};

pub const BUILTIN_TOOL_NAMES: [&str; 7] = [
    "read_file",
    "write_file",
    "list_directory",
    "file_exists",
    "get_file_info",
    "execute_command",
    "get_current_dir",
];

pub fn normalize_tool_ref(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    let raw_tool_name = trimmed.split("::").last().unwrap_or(trimmed);
    let tool_name = match raw_tool_name {
        "run_command" => "execute_command",
        _ => raw_tool_name,
    };
    if BUILTIN_TOOL_NAMES.iter().any(|name| name == &tool_name) {
        Some(tool_name.to_string())
    } else {
        None
    }
}

pub fn is_builtin_tool(value: &str) -> bool {
    normalize_tool_ref(value).is_some()
}

/// Built-in tool executor for filesystem and command tools.
pub struct BuiltinToolExecutor;

impl BuiltinToolExecutor {
    pub fn new() -> Self {
        Self
    }

    pub fn tool_schemas() -> Vec<ToolSchema> {
        let mut schemas = vec![];

        for schema_json in FilesystemTool::get_tool_schemas() {
            if let Ok(schema) = serde_json::from_value::<ToolSchema>(schema_json) {
                schemas.push(schema);
            }
        }

        for schema_json in CommandTool::get_tool_schemas() {
            if let Ok(schema) = serde_json::from_value::<ToolSchema>(schema_json) {
                schemas.push(schema);
            }
        }

        schemas
    }
}

impl Default for BuiltinToolExecutor {
    fn default() -> Self {
        Self::new()
    }
}

fn normalize_tool_name(name: &str) -> &str {
    name.split("::").last().unwrap_or(name)
}

#[async_trait]
impl ToolExecutor for BuiltinToolExecutor {
    async fn execute(&self, call: &ToolCall) -> std::result::Result<ToolResult, ToolError> {
        let args_raw = call.function.arguments.trim();
        let args: serde_json::Value = if args_raw.is_empty() {
            json!({})
        } else {
            serde_json::from_str(args_raw).map_err(|e| {
                ToolError::InvalidArguments(format!("Invalid JSON arguments: {}", e))
            })?
        };

        match normalize_tool_name(call.function.name.as_str()) {
            "read_file" => {
                let path = args["path"].as_str().ok_or_else(|| {
                    ToolError::InvalidArguments("Missing 'path' parameter".to_string())
                })?;

                match FilesystemTool::read_file(path).await {
                    Ok(content) => Ok(ToolResult {
                        success: true,
                        result: content,
                        display_preference: Some("markdown".to_string()),
                    }),
                    Err(e) => Ok(ToolResult {
                        success: false,
                        result: e,
                        display_preference: None,
                    }),
                }
            }
            "write_file" => {
                let path = args["path"].as_str().ok_or_else(|| {
                    ToolError::InvalidArguments("Missing 'path' parameter".to_string())
                })?;
                let content = args["content"].as_str().ok_or_else(|| {
                    ToolError::InvalidArguments("Missing 'content' parameter".to_string())
                })?;

                match FilesystemTool::write_file(path, content).await {
                    Ok(_) => Ok(ToolResult {
                        success: true,
                        result: format!("File written successfully: {}", path),
                        display_preference: None,
                    }),
                    Err(e) => Ok(ToolResult {
                        success: false,
                        result: e,
                        display_preference: None,
                    }),
                }
            }
            "list_directory" => {
                let path = resolve_path_or_cwd(&args)?;

                match FilesystemTool::list_directory(&path).await {
                    Ok(entries) => Ok(ToolResult {
                        success: true,
                        result: entries.join("\n"),
                        display_preference: Some("markdown".to_string()),
                    }),
                    Err(e) => Ok(ToolResult {
                        success: false,
                        result: e,
                        display_preference: None,
                    }),
                }
            }
            "file_exists" => {
                let path = resolve_path_or_cwd(&args)?;

                match FilesystemTool::file_exists(&path).await {
                    Ok(exists) => Ok(ToolResult {
                        success: true,
                        result: if exists { "true" } else { "false" }.to_string(),
                        display_preference: None,
                    }),
                    Err(e) => Ok(ToolResult {
                        success: false,
                        result: e,
                        display_preference: None,
                    }),
                }
            }
            "get_file_info" => {
                let path = resolve_path_or_cwd(&args)?;

                match FilesystemTool::get_file_info(&path).await {
                    Ok(info) => Ok(ToolResult {
                        success: true,
                        result: info,
                        display_preference: Some("markdown".to_string()),
                    }),
                    Err(e) => Ok(ToolResult {
                        success: false,
                        result: e,
                        display_preference: None,
                    }),
                }
            }
            "execute_command" => {
                let command = args["command"].as_str().ok_or_else(|| {
                    ToolError::InvalidArguments("Missing 'command' parameter".to_string())
                })?;

                let args_vec: Vec<String> = args["args"]
                    .as_array()
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(String::from))
                            .collect()
                    })
                    .unwrap_or_default();

                let cwd = args["cwd"].as_str();

                match CommandTool::execute(command, args_vec, cwd, 30).await {
                    Ok(result) => Ok(ToolResult {
                        success: result.success,
                        result: result.format_output(),
                        display_preference: Some("markdown".to_string()),
                    }),
                    Err(e) => Ok(ToolResult {
                        success: false,
                        result: e,
                        display_preference: None,
                    }),
                }
            }
            "get_current_dir" => match CommandTool::get_current_dir().await {
                Ok(dir) => Ok(ToolResult {
                    success: true,
                    result: dir,
                    display_preference: None,
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    result: e,
                    display_preference: None,
                }),
            },
            other => Err(ToolError::NotFound(format!("Tool '{}' not found", other))),
        }
    }

    fn list_tools(&self) -> Vec<ToolSchema> {
        Self::tool_schemas()
    }
}

#[cfg(test)]
mod tests {
    use super::normalize_tool_ref;

    #[test]
    fn normalize_tool_ref_supports_legacy_run_command_alias() {
        assert_eq!(
            normalize_tool_ref("default::run_command"),
            Some("execute_command".to_string())
        );
    }

    #[test]
    fn normalize_tool_ref_rejects_unknown_tool() {
        assert_eq!(normalize_tool_ref("default::search"), None);
    }
}

fn resolve_path_or_cwd(args: &serde_json::Value) -> std::result::Result<String, ToolError> {
    if let Some(path) = args.get("path").and_then(|value| value.as_str()) {
        if !path.is_empty() {
            return Ok(path.to_string());
        }
    }

    std::env::current_dir()
        .map(|path| path.to_string_lossy().to_string())
        .map_err(|e| {
            ToolError::InvalidArguments(format!(
                "Missing 'path' parameter and failed to resolve current dir: {}",
                e
            ))
        })
}
