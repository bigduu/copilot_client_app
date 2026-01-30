use anyhow::Result;
use log::{debug, error, info, warn};
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::path::PathBuf;
use std::process::Command;
use crate::bodhi_settings::{config_json_path, read_claude_binary_path, read_claude_installation_preference};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum InstallationType {
    System,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeInstallation {
    pub path: String,
    pub version: Option<String>,
    pub source: String,
    pub installation_type: InstallationType,
}

pub fn find_claude_binary(_app_handle: &tauri::AppHandle) -> Result<String, String> {
    info!("Searching for claude binary...");

    let config_path = config_json_path();
    match read_claude_binary_path(&config_path) {
        Ok(Some(stored_path)) => {
            info!("Found stored claude path in config: {}", stored_path);
            let path_buf = PathBuf::from(&stored_path);
            if path_buf.exists() && path_buf.is_file() {
                return Ok(stored_path);
            }
            warn!("Stored claude path no longer exists: {}", stored_path);
        }
        Ok(None) => {}
        Err(err) => {
            warn!("Failed to read claude config: {}", err);
        }
    }

    match read_claude_installation_preference(&config_path) {
        Ok(Some(preference)) => {
            info!("User preference for Claude installation: {}", preference);
        }
        Ok(None) => {}
        Err(err) => {
            warn!("Failed to read claude installation preference: {}", err);
        }
    }

    let installations = discover_system_installations();

    if installations.is_empty() {
        error!("Could not find claude binary in any location");
        return Err("Claude Code not found. Please ensure it's installed in one of these locations: PATH, /usr/local/bin, /opt/homebrew/bin, ~/.nvm/versions/node/*/bin, ~/.claude/local, ~/.local/bin".to_string());
    }

    for installation in &installations {
        info!("Found Claude installation: {:?}", installation);
    }

    if let Some(best) = select_best_installation(installations) {
        info!(
            "Selected Claude installation: path={}, version={:?}, source={}",
            best.path, best.version, best.source
        );
        Ok(best.path)
    } else {
        Err("No valid Claude installation found".to_string())
    }
}

pub fn discover_claude_installations() -> Vec<ClaudeInstallation> {
    info!("Discovering all Claude installations...");

    let mut installations = discover_system_installations();

    installations.sort_by(|a, b| {
        match (&a.version, &b.version) {
            (Some(v1), Some(v2)) => {
                match compare_versions(v2, v1) {
                    Ordering::Equal => {
                        source_preference(a).cmp(&source_preference(b))
                    }
                    other => other,
                }
            }
            (Some(_), None) => Ordering::Less,
            (None, Some(_)) => Ordering::Greater,
            (None, None) => source_preference(a).cmp(&source_preference(b)),
        }
    });

    installations
}

fn source_preference(installation: &ClaudeInstallation) -> u8 {
    match installation.source.as_str() {
        "which" => 1,
        "homebrew" => 2,
        "system" => 3,
        "nvm-active" => 4,
        source if source.starts_with("nvm") => 5,
        "local-bin" => 6,
        "claude-local" => 7,
        "npm-global" => 8,
        "yarn" | "yarn-global" => 9,
        "bun" => 10,
        "node-modules" => 11,
        "home-bin" => 12,
        "PATH" => 13,
        _ => 14,
    }
}

fn discover_system_installations() -> Vec<ClaudeInstallation> {
    let mut installations = Vec::new();

    if let Some(installation) = try_which_command() {
        installations.push(installation);
    }

    installations.extend(find_nvm_installations());

    installations.extend(find_standard_installations());

    let mut unique_paths = std::collections::HashSet::new();
    installations.retain(|install| unique_paths.insert(install.path.clone()));

    installations
}

#[cfg(unix)]
fn try_which_command() -> Option<ClaudeInstallation> {
    debug!("Trying 'which claude' to find binary...");

    match Command::new("which").arg("claude").output() {
        Ok(output) if output.status.success() => {
            let output_str = String::from_utf8_lossy(&output.stdout).trim().to_string();

            if output_str.is_empty() {
                return None;
            }

            let path = if output_str.starts_with("claude:") && output_str.contains("aliased to") {
                output_str
                    .split("aliased to")
                    .nth(1)
                    .map(|s| s.trim().to_string())
            } else {
                Some(output_str)
            }?;

            debug!("'which' found claude at: {}", path);

            if !PathBuf::from(&path).exists() {
                warn!("Path from 'which' does not exist: {}", path);
                return None;
            }

            let version = get_claude_version(&path).ok().flatten();

            Some(ClaudeInstallation {
                path,
                version,
                source: "which".to_string(),
                installation_type: InstallationType::System,
            })
        }
        _ => None,
    }
}

#[cfg(windows)]
fn try_which_command() -> Option<ClaudeInstallation> {
    debug!("Trying 'where claude' to find binary...");

    match Command::new("where").arg("claude").output() {
        Ok(output) if output.status.success() => {
            let output_str = String::from_utf8_lossy(&output.stdout).trim().to_string();

            if output_str.is_empty() {
                return None;
            }

            let path = output_str.lines().next().unwrap_or("").trim().to_string();

            if path.is_empty() {
                return None;
            }

            debug!("'where' found claude at: {}", path);

            if !PathBuf::from(&path).exists() {
                warn!("Path from 'where' does not exist: {}", path);
                return None;
            }

            let version = get_claude_version(&path).ok().flatten();

            Some(ClaudeInstallation {
                path,
                version,
                source: "where".to_string(),
                installation_type: InstallationType::System,
            })
        }
        _ => None,
    }
}

#[cfg(unix)]
fn find_nvm_installations() -> Vec<ClaudeInstallation> {
    let mut installations = Vec::new();

    if let Ok(nvm_bin) = std::env::var("NVM_BIN") {
        let claude_path = PathBuf::from(&nvm_bin).join("claude");
        if claude_path.exists() && claude_path.is_file() {
            debug!("Found Claude via NVM_BIN: {:?}", claude_path);
            let version = get_claude_version(&claude_path.to_string_lossy())
                .ok()
                .flatten();
            installations.push(ClaudeInstallation {
                path: claude_path.to_string_lossy().to_string(),
                version,
                source: "nvm-active".to_string(),
                installation_type: InstallationType::System,
            });
        }
    }

    if let Ok(home) = std::env::var("HOME") {
        let nvm_dir = PathBuf::from(&home)
            .join(".nvm")
            .join("versions")
            .join("node");

        debug!("Checking NVM directory: {:?}", nvm_dir);

        if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
            for entry in entries.flatten() {
                if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    let claude_path = entry.path().join("bin").join("claude");

                    if claude_path.exists() && claude_path.is_file() {
                        let path_str = claude_path.to_string_lossy().to_string();
                        let node_version = entry.file_name().to_string_lossy().to_string();

                        debug!("Found Claude in NVM node {}: {}", node_version, path_str);

                        let version = get_claude_version(&path_str).ok().flatten();

                        installations.push(ClaudeInstallation {
                            path: path_str,
                            version,
                            source: format!("nvm ({})", node_version),
                            installation_type: InstallationType::System,
                        });
                    }
                }
            }
        }
    }

    installations
}

#[cfg(windows)]
fn find_nvm_installations() -> Vec<ClaudeInstallation> {
    let mut installations = Vec::new();

    if let Ok(nvm_home) = std::env::var("NVM_HOME") {
        debug!("Checking NVM_HOME directory: {:?}", nvm_home);

        if let Ok(entries) = std::fs::read_dir(&nvm_home) {
            for entry in entries.flatten() {
                if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    let claude_path = entry.path().join("claude.exe");

                    if claude_path.exists() && claude_path.is_file() {
                        let path_str = claude_path.to_string_lossy().to_string();
                        let node_version = entry.file_name().to_string_lossy().to_string();

                        debug!("Found Claude in NVM node {}: {}", node_version, path_str);

                        let version = get_claude_version(&path_str).ok().flatten();

                        installations.push(ClaudeInstallation {
                            path: path_str,
                            version,
                            source: format!("nvm ({})", node_version),
                            installation_type: InstallationType::System,
                        });
                    }
                }
            }
        }
    }

    installations
}

#[cfg(unix)]
fn find_standard_installations() -> Vec<ClaudeInstallation> {
    let mut installations = Vec::new();

    let mut paths_to_check: Vec<(String, String)> = vec![
        ("/usr/local/bin/claude".to_string(), "system".to_string()),
        (
            "/opt/homebrew/bin/claude".to_string(),
            "homebrew".to_string(),
        ),
        ("/usr/bin/claude".to_string(), "system".to_string()),
        ("/bin/claude".to_string(), "system".to_string()),
    ];

    if let Ok(home) = std::env::var("HOME") {
        paths_to_check.extend(vec![
            (
                format!("{}/.claude/local/claude", home),
                "claude-local".to_string(),
            ),
            (
                format!("{}/.local/bin/claude", home),
                "local-bin".to_string(),
            ),
            (
                format!("{}/.npm-global/bin/claude", home),
                "npm-global".to_string(),
            ),
            (format!("{}/.yarn/bin/claude", home), "yarn".to_string()),
            (format!("{}/.bun/bin/claude", home), "bun".to_string()),
            (format!("{}/bin/claude", home), "home-bin".to_string()),
            (
                format!("{}/node_modules/.bin/claude", home),
                "node-modules".to_string(),
            ),
            (
                format!("{}/.config/yarn/global/node_modules/.bin/claude", home),
                "yarn-global".to_string(),
            ),
        ]);
    }

    for (path, source) in paths_to_check {
        let path_buf = PathBuf::from(&path);
        if path_buf.exists() && path_buf.is_file() {
            debug!("Found claude at standard path: {} ({})", path, source);

            let version = get_claude_version(&path).ok().flatten();

            installations.push(ClaudeInstallation {
                path,
                version,
                source,
                installation_type: InstallationType::System,
            });
        }
    }

    if let Ok(output) = Command::new("claude").arg("--version").output() {
        if output.status.success() {
            debug!("claude is available in PATH");
            let version = extract_version_from_output(&output.stdout);

            installations.push(ClaudeInstallation {
                path: "claude".to_string(),
                version,
                source: "PATH".to_string(),
                installation_type: InstallationType::System,
            });
        }
    }

    installations
}

#[cfg(windows)]
fn find_standard_installations() -> Vec<ClaudeInstallation> {
    let mut installations = Vec::new();

    let mut paths_to_check: Vec<(String, String)> = vec![];

    if let Ok(user_profile) = std::env::var("USERPROFILE") {
        paths_to_check.extend(vec![
            (
                format!("{}\\.claude\\local\\claude.exe", user_profile),
                "claude-local".to_string(),
            ),
            (
                format!("{}\\.local\\bin\\claude.exe", user_profile),
                "local-bin".to_string(),
            ),
            (
                format!("{}\\AppData\\Roaming\\npm\\claude.cmd", user_profile),
                "npm-global".to_string(),
            ),
            (
                format!("{}\\.yarn\\bin\\claude.cmd", user_profile),
                "yarn".to_string(),
            ),
            (
                format!("{}\\.bun\\bin\\claude.exe", user_profile),
                "bun".to_string(),
            ),
        ]);
    }

    for (path, source) in paths_to_check {
        let path_buf = PathBuf::from(&path);
        if path_buf.exists() && path_buf.is_file() {
            debug!("Found claude at standard path: {} ({})", path, source);

            let version = get_claude_version(&path).ok().flatten();

            installations.push(ClaudeInstallation {
                path,
                version,
                source,
                installation_type: InstallationType::System,
            });
        }
    }

    if let Ok(output) = Command::new("claude.exe").arg("--version").output() {
        if output.status.success() {
            debug!("claude.exe is available in PATH");
            let version = extract_version_from_output(&output.stdout);

            installations.push(ClaudeInstallation {
                path: "claude.exe".to_string(),
                version,
                source: "PATH".to_string(),
                installation_type: InstallationType::System,
            });
        }
    }

    installations
}

fn get_claude_version(path: &str) -> Result<Option<String>, String> {
    match Command::new(path).arg("--version").output() {
        Ok(output) => {
            if output.status.success() {
                Ok(extract_version_from_output(&output.stdout))
            } else {
                Ok(None)
            }
        }
        Err(e) => {
            warn!("Failed to get version for {}: {}", path, e);
            Ok(None)
        }
    }
}

fn extract_version_from_output(stdout: &[u8]) -> Option<String> {
    let output_str = String::from_utf8_lossy(stdout);

    debug!("Raw version output: {:?}", output_str);

    let version_regex =
        regex::Regex::new(r"(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?)").ok()?;

    if let Some(captures) = version_regex.captures(&output_str) {
        if let Some(version_match) = captures.get(1) {
            let version = version_match.as_str().to_string();
            debug!("Extracted version: {:?}", version);
            return Some(version);
        }
    }

    debug!("No version found in output");
    None
}

fn select_best_installation(installations: Vec<ClaudeInstallation>) -> Option<ClaudeInstallation> {
    installations.into_iter().max_by(|a, b| {
        match (&a.version, &b.version) {
            (Some(v1), Some(v2)) => compare_versions(v1, v2),
            (Some(_), None) => Ordering::Greater,
            (None, Some(_)) => Ordering::Less,
            (None, None) => {
                if a.path == "claude" && b.path != "claude" {
                    Ordering::Less
                } else if a.path != "claude" && b.path == "claude" {
                    Ordering::Greater
                } else {
                    Ordering::Equal
                }
            }
        }
    })
}

fn compare_versions(a: &str, b: &str) -> Ordering {
    let a_parts: Vec<u32> = a
        .split('.')
        .filter_map(|s| {
            s.chars()
                .take_while(|c| c.is_numeric())
                .collect::<String>()
                .parse()
                .ok()
        })
        .collect();

    let b_parts: Vec<u32> = b
        .split('.')
        .filter_map(|s| {
            s.chars()
                .take_while(|c| c.is_numeric())
                .collect::<String>()
                .parse()
                .ok()
        })
        .collect();

    for i in 0..std::cmp::max(a_parts.len(), b_parts.len()) {
        let a_val = a_parts.get(i).unwrap_or(&0);
        let b_val = b_parts.get(i).unwrap_or(&0);
        match a_val.cmp(b_val) {
            Ordering::Equal => continue,
            other => return other,
        }
    }

    Ordering::Equal
}

pub fn create_command_with_env(program: &str) -> Command {
    let mut cmd = Command::new(program);

    info!("Creating command for: {}", program);

    for (key, value) in std::env::vars() {
        if key == "PATH"
            || key == "HOME"
            || key == "USER"
            || key == "SHELL"
            || key == "LANG"
            || key == "LC_ALL"
            || key.starts_with("LC_")
            || key == "NODE_PATH"
            || key == "NVM_DIR"
            || key == "NVM_BIN"
            || key == "HOMEBREW_PREFIX"
            || key == "HOMEBREW_CELLAR"
            || key == "HTTP_PROXY"
            || key == "HTTPS_PROXY"
            || key == "NO_PROXY"
            || key == "ALL_PROXY"
        {
            debug!("Inheriting env var: {}={}", key, value);
            cmd.env(&key, &value);
        }
    }

    info!("Command will use proxy settings:");
    if let Ok(http_proxy) = std::env::var("HTTP_PROXY") {
        info!("  HTTP_PROXY={}", http_proxy);
    }
    if let Ok(https_proxy) = std::env::var("HTTPS_PROXY") {
        info!("  HTTPS_PROXY={}", https_proxy);
    }

    if program.contains("/.nvm/versions/node/") {
        if let Some(node_bin_dir) = std::path::Path::new(program).parent() {
            let current_path = std::env::var("PATH").unwrap_or_default();
            let node_bin_str = node_bin_dir.to_string_lossy();
            if !current_path.contains(&node_bin_str.as_ref()) {
                let new_path = format!("{}:{}", node_bin_str, current_path);
                debug!("Adding NVM bin directory to PATH: {}", node_bin_str);
                cmd.env("PATH", new_path);
            }
        }
    }

    if program.contains("/homebrew/") || program.contains("/opt/homebrew/") {
        if let Some(program_dir) = std::path::Path::new(program).parent() {
            let current_path = std::env::var("PATH").unwrap_or_default();
            let homebrew_bin_str = program_dir.to_string_lossy();
            if !current_path.contains(&homebrew_bin_str.as_ref()) {
                let new_path = format!("{}:{}", homebrew_bin_str, current_path);
                debug!(
                    "Adding Homebrew bin directory to PATH: {}",
                    homebrew_bin_str
                );
                cmd.env("PATH", new_path);
            }
        }
    }

    cmd
}
