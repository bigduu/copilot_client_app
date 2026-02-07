use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use thiserror::Error;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc;

#[derive(Debug, Error)]
pub enum InstallerError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("process error: {0}")]
    Process(String),
    #[error("invalid request: {0}")]
    InvalidRequest(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum InstallScope {
    Global,
    Project,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum InstallTarget {
    ClaudeCode,
    ClaudeRouter,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LastInstalled {
    pub claude_code: Option<String>,
    pub claude_router: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EnvVar {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct InstallerSettings {
    pub claude_code_package: String,
    pub claude_router_package: String,
    pub install_scope: InstallScope,
    pub last_installed: Option<LastInstalled>,
    #[serde(default)]
    pub env_vars: Vec<EnvVar>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct NpmDetectResponse {
    pub available: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct InstallRequest {
    pub package: String,
    pub scope: InstallScope,
    pub project_dir: Option<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct InstallResult {
    pub success: bool,
    pub exit_code: Option<i32>,
}

pub struct InstallHandle {
    pub output_rx: mpsc::Receiver<String>,
    pub done: tokio::task::JoinHandle<Result<InstallResult, InstallerError>>,
}

pub fn default_settings() -> InstallerSettings {
    InstallerSettings {
        claude_code_package: "@anthropic-ai/claude-code".to_string(),
        claude_router_package: "@musistudio/claude-code-router".to_string(),
        install_scope: InstallScope::Global,
        last_installed: None,
        env_vars: Vec::new(),
    }
}

fn settings_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("claude_install.json")
}

pub async fn load_settings(app_data_dir: &Path) -> Result<InstallerSettings, InstallerError> {
    tokio::fs::create_dir_all(app_data_dir).await?;
    let path = settings_path(app_data_dir);
    if !path.exists() {
        let settings = default_settings();
        save_settings(app_data_dir, &settings).await?;
        return Ok(settings);
    }
    let content = tokio::fs::read_to_string(&path).await?;
    let settings: InstallerSettings = serde_json::from_str(&content)?;
    Ok(settings)
}

pub async fn save_settings(
    app_data_dir: &Path,
    settings: &InstallerSettings,
) -> Result<InstallerSettings, InstallerError> {
    tokio::fs::create_dir_all(app_data_dir).await?;
    let path = settings_path(app_data_dir);
    let content = serde_json::to_string_pretty(settings)?;
    tokio::fs::write(path, content).await?;
    Ok(settings.clone())
}

pub async fn mark_installed(
    app_data_dir: &Path,
    target: InstallTarget,
) -> Result<InstallerSettings, InstallerError> {
    let mut settings = load_settings(app_data_dir).await?;
    let now = Utc::now().to_rfc3339();
    let mut last = settings.last_installed.unwrap_or(LastInstalled {
        claude_code: None,
        claude_router: None,
    });
    match target {
        InstallTarget::ClaudeCode => last.claude_code = Some(now),
        InstallTarget::ClaudeRouter => last.claude_router = Some(now),
    }
    settings.last_installed = Some(last);
    save_settings(app_data_dir, &settings).await
}

pub async fn detect_npm() -> NpmDetectResponse {
    let path = resolve_npm_path().await;
    match Command::new("npm").arg("--version").output().await {
        Ok(output) if output.status.success() => {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            NpmDetectResponse {
                available: true,
                path,
                version: if version.is_empty() {
                    None
                } else {
                    Some(version)
                },
                error: None,
            }
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            NpmDetectResponse {
                available: false,
                path,
                version: None,
                error: if stderr.is_empty() {
                    None
                } else {
                    Some(stderr)
                },
            }
        }
        Err(e) => NpmDetectResponse {
            available: false,
            path,
            version: None,
            error: Some(e.to_string()),
        },
    }
}

async fn resolve_npm_path() -> Option<String> {
    let output = if cfg!(target_os = "windows") {
        Command::new("where").arg("npm").output().await.ok()
    } else {
        Command::new("which").arg("npm").output().await.ok()
    }?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout.lines().next().map(|s| s.trim().to_string())
}

fn build_install_args(scope: &InstallScope, package: &str) -> Vec<String> {
    let mut args = vec!["install".to_string()];
    if scope == &InstallScope::Global {
        args.push("-g".to_string());
    }
    args.push(package.to_string());
    args
}

pub async fn spawn_install(request: InstallRequest) -> Result<InstallHandle, InstallerError> {
    if request.package.trim().is_empty() {
        return Err(InstallerError::InvalidRequest(
            "package required".to_string(),
        ));
    }

    let mut cmd = Command::new("npm");
    for arg in build_install_args(&request.scope, &request.package) {
        cmd.arg(arg);
    }

    if request.scope == InstallScope::Project {
        let project_dir = request
            .project_dir
            .ok_or_else(|| InstallerError::InvalidRequest("project_dir required".to_string()))?;
        cmd.current_dir(project_dir);
    }

    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| InstallerError::Process(e.to_string()))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let (tx, rx) = mpsc::channel(200);

    if let Some(stdout) = stdout {
        let tx_stdout = tx.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                if tx_stdout.send(line).await.is_err() {
                    break;
                }
            }
        });
    }

    if let Some(stderr) = stderr {
        let tx_stderr = tx.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                if tx_stderr.send(line).await.is_err() {
                    break;
                }
            }
        });
    }

    let done = tokio::spawn(async move {
        let status = child
            .wait()
            .await
            .map_err(|e| InstallerError::Process(e.to_string()))?;
        Ok(InstallResult {
            success: status.success(),
            exit_code: status.code(),
        })
    });

    Ok(InstallHandle {
        output_rx: rx,
        done,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_build_install_args_global() {
        let args = build_install_args(&InstallScope::Global, "foo");
        assert_eq!(args, vec!["install", "-g", "foo"]);
    }

    #[test]
    fn test_build_install_args_project() {
        let args = build_install_args(&InstallScope::Project, "bar");
        assert_eq!(args, vec!["install", "bar"]);
    }

    #[tokio::test]
    async fn test_load_settings_defaults_when_missing() {
        let dir = TempDir::new().unwrap();
        let settings = load_settings(dir.path()).await.unwrap();
        assert_eq!(settings.install_scope, InstallScope::Global);
        assert_eq!(settings.claude_code_package, "CLAUDE_CODE_NPM_PACKAGE");
    }
}
