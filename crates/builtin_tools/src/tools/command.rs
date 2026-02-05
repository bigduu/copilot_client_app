use tokio::process::Command;
use tokio::time::{timeout, Duration};
use serde_json::json;

/// 命令执行工具
pub struct CommandTool;

/// 命令执行结果
#[derive(Debug)]
pub struct CommandResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub success: bool,
}

impl CommandTool {
    /// 执行系统命令（带超时）
    pub async fn execute(
        cmd: &str, 
        args: Vec<String>, 
        cwd: Option<&str>,
        timeout_secs: u64,
    ) -> Result<CommandResult, String> {
        // 安全检查：禁止危险命令
        let dangerous_commands = ["rm -rf /", "rm -rf /*", "> /dev/sda", "dd if=/dev/zero"];
        let full_cmd = format!("{} {}", cmd, args.join(" "));
        for dangerous in &dangerous_commands {
            if full_cmd.contains(dangerous) {
                return Err(format!("Dangerous command blocked: {}", dangerous));
            }
        }
        
        let mut command = Command::new(cmd);
        command.args(&args);
        
        if let Some(dir) = cwd {
            // 安全检查：确保工作目录不包含 ..
            if dir.contains("..") {
                return Err("Invalid working directory: contains '..'".to_string());
            }
            command.current_dir(dir);
        }
        
        // 执行命令并设置超时
        let output = timeout(
            Duration::from_secs(timeout_secs),
            command.output()
        ).await
        .map_err(|_| "Command timed out".to_string())?
        .map_err(|e| format!("Failed to execute command '{}': {}", cmd, e))?;
        
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let exit_code = output.status.code().unwrap_or(-1);
        let success = output.status.success();
        
        Ok(CommandResult {
            stdout,
            stderr,
            exit_code,
            success,
        })
    }
    
    /// 执行简单命令（默认 30 秒超时）
    pub async fn execute_simple(cmd: &str, args: Vec<String>) -> Result<String, String> {
        let result = Self::execute(cmd, args, None, 30).await?;
        
        if result.success {
            Ok(result.stdout)
        } else {
            Err(format!(
                "Command failed with exit code {}: {}",
                result.exit_code,
                if result.stderr.is_empty() { &result.stdout } else { &result.stderr }
            ))
        }
    }
    
    /// 执行命令并返回详细结果
    pub async fn execute_detailed(
        cmd: &str, 
        args: Vec<String>,
        cwd: Option<&str>,
    ) -> Result<CommandResult, String> {
        Self::execute(cmd, args, cwd, 30).await
    }
    
    /// 获取当前工作目录
    pub async fn get_current_dir() -> Result<String, String> {
        std::env::current_dir()
            .map(|p| p.to_string_lossy().to_string())
            .map_err(|e| format!("Failed to get current directory: {}", e))
    }
    
    /// 检查命令是否存在
    pub async fn command_exists(cmd: &str) -> bool {
        Command::new("which")
            .arg(cmd)
            .output()
            .await
            .map(|output| output.status.success())
            .unwrap_or(false)
    }
    
    /// 获取工具 schema
    pub fn get_tool_schemas() -> Vec<serde_json::Value> {
        vec![
            json!({
                "type": "function",
                "function": {
                    "name": "execute_command",
                    "description": "执行系统命令。支持常用命令如 ls, cat, pwd, echo, git, cargo 等。命令会在 30 秒后超时",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "command": {
                                "type": "string",
                                "description": "命令名称，例如 'ls', 'cat', 'git'"
                            },
                            "args": {
                                "type": "array",
                                "items": {
                                    "type": "string"
                                },
                                "description": "命令参数列表"
                            },
                            "cwd": {
                                "type": "string",
                                "description": "工作目录（可选），默认为当前目录"
                            }
                        },
                        "required": ["command"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "get_current_dir",
                    "description": "获取当前工作目录的绝对路径",
                    "parameters": {
                        "type": "object",
                        "properties": {}
                    }
                }
            }),
        ]
    }
}

impl CommandResult {
    /// 格式化输出用于显示
    pub fn format_output(&self) -> String {
        let mut output = String::new();
        
        if !self.stdout.is_empty() {
            output.push_str("STDOUT:\n");
            output.push_str(&self.stdout);
            output.push('\n');
        }
        
        if !self.stderr.is_empty() {
            output.push_str("STDERR:\n");
            output.push_str(&self.stderr);
            output.push('\n');
        }
        
        output.push_str(&format!("Exit code: {}\n", self.exit_code));
        output.push_str(&format!("Success: {}\n", self.success));
        
        output
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_execute_echo() {
        let result = CommandTool::execute_simple("echo", vec!["Hello".to_string()]).await;
        assert!(result.is_ok());
        assert!(result.unwrap().contains("Hello"));
    }

    #[tokio::test]
    async fn test_execute_ls() {
        let result = CommandTool::execute_simple("ls", vec!["/tmp".to_string()]).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_dangerous_command_blocked() {
        let result = CommandTool::execute_simple("rm", vec!["-rf".to_string(), "/".to_string()]).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("blocked"));
    }

    #[tokio::test]
    async fn test_command_not_found() {
        let result = CommandTool::execute_simple("nonexistent_command_xyz", vec![]).await;
        assert!(result.is_err());
    }
}
