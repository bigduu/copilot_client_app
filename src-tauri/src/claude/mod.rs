mod command;
mod discovery;
mod version;

use crate::bodhi_settings::{
    config_json_path, read_claude_binary_path, read_claude_installation_preference,
};
use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;

use discovery::discover_system_installations;
use version::{compare_versions, source_preference};

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
            let path_buf = std::path::PathBuf::from(&stored_path);
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

    installations.sort_by(|a, b| match (&a.version, &b.version) {
        (Some(v1), Some(v2)) => match compare_versions(v2, v1) {
            Ordering::Equal => source_preference(a).cmp(&source_preference(b)),
            other => other,
        },
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => source_preference(a).cmp(&source_preference(b)),
    });

    installations
}

fn select_best_installation(installations: Vec<ClaudeInstallation>) -> Option<ClaudeInstallation> {
    installations
        .into_iter()
        .max_by(|a, b| match (&a.version, &b.version) {
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
        })
}

pub use command::create_command_with_env;
