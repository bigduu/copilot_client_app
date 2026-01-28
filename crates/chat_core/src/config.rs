use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub http_proxy: String,
    pub https_proxy: String,
    #[serde(default)]
    pub http_proxy_auth: Option<ProxyAuth>,
    #[serde(default)]
    pub https_proxy_auth: Option<ProxyAuth>,
    pub api_key: Option<String>,
    pub api_base: Option<String>,
    pub model: Option<String>,
    #[serde(default)]
    pub headless_auth: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyAuth {
    pub username: String,
    pub password: String,
}

const CONFIG_FILE_PATH: &str = "config.toml";

fn bodhi_dir() -> PathBuf {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::temp_dir())
        .join(".bodhi")
}

fn bodhi_config_json_path() -> PathBuf {
    bodhi_dir().join("config.json")
}

fn parse_bool_env(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "1" | "true" | "yes" | "y" | "on"
    )
}

impl Default for Config {
    fn default() -> Self {
        Self::new()
    }
}

impl Config {
    pub fn new() -> Self {
        let mut config = Config {
            http_proxy: String::new(),
            https_proxy: String::new(),
            http_proxy_auth: None,
            https_proxy_auth: None,
            api_key: None,
            api_base: None,
            model: None,
            headless_auth: false,
        };

        let mut loaded = false;
        let json_path = bodhi_config_json_path();
        if json_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&json_path) {
                if let Ok(file_config) = serde_json::from_str::<Config>(&content) {
                    config = file_config;
                    loaded = true;
                }
            }
        }

        if !loaded && std::path::Path::new(CONFIG_FILE_PATH).exists() {
            if let Ok(content) = std::fs::read_to_string(CONFIG_FILE_PATH) {
                if let Ok(file_config) = toml::from_str::<Config>(&content) {
                    config = file_config;
                }
            }
        }

        if let Ok(http_proxy) = std::env::var("HTTP_PROXY") {
            config.http_proxy = http_proxy;
        }
        if let Ok(https_proxy) = std::env::var("HTTPS_PROXY") {
            config.https_proxy = https_proxy;
        }
        if let Ok(api_key) = std::env::var("API_KEY") {
            config.api_key = Some(api_key);
        }
        if let Ok(api_base) = std::env::var("API_BASE") {
            config.api_base = Some(api_base);
        }
        if let Ok(model) = std::env::var("MODEL") {
            config.model = Some(model);
        }
        if let Ok(headless) = std::env::var("COPILOT_CHAT_HEADLESS") {
            config.headless_auth = parse_bool_env(&headless);
        }
        config
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_bool_env_true_values() {
        for value in ["1", "true", "TRUE", " yes ", "Y", "on"] {
            assert!(parse_bool_env(value), "value {value:?} should be true");
        }
    }

    #[test]
    fn parse_bool_env_false_values() {
        for value in ["0", "false", "no", "off", "", "  "] {
            assert!(!parse_bool_env(value), "value {value:?} should be false");
        }
    }
}
