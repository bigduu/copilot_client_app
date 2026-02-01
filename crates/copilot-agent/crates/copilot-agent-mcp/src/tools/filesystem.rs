use std::path::Path;
use tokio::fs;
use serde_json::json;

/// 文件系统工具
pub struct FilesystemTool;

impl FilesystemTool {
    /// 读取文件内容
    pub async fn read_file(path: &str) -> Result<String, String> {
        // 安全检查：确保路径不包含 ..
        if path.contains("..") {
            return Err("Invalid path: contains '..'".to_string());
        }
        
        fs::read_to_string(path)
            .await
            .map_err(|e| format!("Failed to read file '{}': {}", path, e))
    }
    
    /// 写入文件内容
    pub async fn write_file(path: &str, content: &str) -> Result<(), String> {
        // 安全检查：确保路径不包含 ..
        if path.contains("..") {
            return Err("Invalid path: contains '..'".to_string());
        }
        
        // 确保父目录存在
        if let Some(parent) = Path::new(path).parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| format!("Failed to create directory '{}': {}", parent.display(), e))?;
        }
        
        fs::write(path, content)
            .await
            .map_err(|e| format!("Failed to write file '{}': {}", path, e))
    }
    
    /// 列出目录内容
    pub async fn list_directory(path: &str) -> Result<Vec<String>, String> {
        // 安全检查：确保路径不包含 ..
        if path.contains("..") {
            return Err("Invalid path: contains '..'".to_string());
        }
        
        let mut entries = vec![];
        let mut dir = fs::read_dir(path)
            .await
            .map_err(|e| format!("Failed to read directory '{}': {}", path, e))?;
        
        while let Some(entry) = dir.next_entry()
            .await
            .map_err(|e| format!("Failed to read directory entry: {}", e))? {
            let file_name = entry.file_name().to_string_lossy().to_string();
            let file_type = if entry.file_type().await.map_err(|e| e.to_string())?.is_dir() {
                "[DIR]"
            } else {
                "[FILE]"
            };
            entries.push(format!("{} {}", file_type, file_name));
        }
        
        Ok(entries)
    }
    
    /// 检查文件是否存在
    pub async fn file_exists(path: &str) -> Result<bool, String> {
        if path.contains("..") {
            return Err("Invalid path: contains '..'".to_string());
        }
        
        Ok(fs::metadata(path).await.is_ok())
    }
    
    /// 获取文件信息
    pub async fn get_file_info(path: &str) -> Result<String, String> {
        if path.contains("..") {
            return Err("Invalid path: contains '..'".to_string());
        }
        
        let metadata = fs::metadata(path)
            .await
            .map_err(|e| format!("Failed to get file info '{}': {}", path, e))?;
        
        let size = metadata.len();
        let is_file = metadata.is_file();
        let is_dir = metadata.is_dir();
        let modified = metadata.modified()
            .map_err(|e| e.to_string())?
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_secs();
        
        Ok(format!(
            "Path: {}\nType: {}\nSize: {} bytes\nModified: {} UTC",
            path,
            if is_file { "File" } else if is_dir { "Directory" } else { "Other" },
            size,
            chrono::DateTime::from_timestamp(modified as i64, 0)
                .map(|d: chrono::DateTime<chrono::Utc>| d.to_rfc3339())
                .unwrap_or_else(|| "Unknown".to_string())
        ))
    }
    
    /// 获取工具 schema
    pub fn get_tool_schemas() -> Vec<serde_json::Value> {
        vec![
            json!({
                "type": "function",
                "function": {
                    "name": "read_file",
                    "description": "读取文件内容，支持 txt, json, md, rs 等文本文件。路径必须是绝对路径，例如 /Users/bigduu/workspace/project/file.txt",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "文件的绝对路径"
                            }
                        },
                        "required": ["path"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "write_file",
                    "description": "写入文件内容。如果文件不存在会自动创建，包括父目录。路径必须是绝对路径",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "文件的绝对路径"
                            },
                            "content": {
                                "type": "string",
                                "description": "要写入的内容"
                            }
                        },
                        "required": ["path", "content"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "list_directory",
                    "description": "列出目录中的所有文件和子目录",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "目录的绝对路径"
                            }
                        },
                        "required": ["path"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "file_exists",
                    "description": "检查文件或目录是否存在",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "文件或目录的绝对路径"
                            }
                        },
                        "required": ["path"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "get_file_info",
                    "description": "获取文件的详细信息（大小、类型、修改时间等）",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "文件的绝对路径"
                            }
                        },
                        "required": ["path"]
                    }
                }
            }),
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::fs;

    #[tokio::test]
    async fn test_read_write_file() {
        let test_path = "/tmp/test_mcp_fs.txt";
        let test_content = "Hello, MCP!";
        
        // 写入文件
        let result = FilesystemTool::write_file(test_path, test_content).await;
        assert!(result.is_ok());
        
        // 读取文件
        let content = FilesystemTool::read_file(test_path).await.unwrap();
        assert_eq!(content, test_content);
        
        // 清理
        let _ = fs::remove_file(test_path).await;
    }

    #[tokio::test]
    async fn test_list_directory() {
        let entries = FilesystemTool::list_directory("/tmp").await;
        assert!(entries.is_ok());
        assert!(!entries.unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_path_traversal_protection() {
        let result = FilesystemTool::read_file("/etc/../etc/passwd").await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid path"));
    }
}
