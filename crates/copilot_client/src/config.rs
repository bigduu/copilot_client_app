use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub http_proxy: String,
    pub https_proxy: String,
    pub api_key: Option<String>,
    pub api_base: Option<String>,
    pub model: Option<String>,
}

const CONFIG_FILE_PATH: &str = "config.toml";

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
            api_key: None,
            api_base: None,
            model: None,
        };

        //detect the config file exists
        if std::path::Path::new(CONFIG_FILE_PATH).exists() {
            // Try to read from config.toml first
            if let Ok(content) = std::fs::read_to_string(CONFIG_FILE_PATH) {
                if let Ok(file_config) = toml::from_str::<Config>(&content) {
                    config = file_config;
                }
            }
        }

        // Override with environment variables if they exist
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
        config
    }
}
