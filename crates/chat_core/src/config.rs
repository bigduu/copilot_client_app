use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub http_proxy: String,
    #[serde(default)]
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
        use crate::paths::config_json_path;

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
        let json_path = config_json_path();
        if json_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&json_path) {
                if let Ok(mut file_config) = serde_json::from_str::<Config>(&content) {
                    file_config.http_proxy_auth = None;
                    file_config.https_proxy_auth = None;
                    config = file_config;
                    loaded = true;
                }
            }
        }

        if !loaded && std::path::Path::new(CONFIG_FILE_PATH).exists() {
            if let Ok(content) = std::fs::read_to_string(CONFIG_FILE_PATH) {
                if let Ok(mut file_config) = toml::from_str::<Config>(&content) {
                    file_config.http_proxy_auth = None;
                    file_config.https_proxy_auth = None;
                    config = file_config;
                }
            }
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
    use std::ffi::OsString;
    use std::path::PathBuf;
    use std::sync::{Mutex, OnceLock};
    use std::time::{SystemTime, UNIX_EPOCH};

    struct EnvVarGuard {
        key: &'static str,
        previous: Option<OsString>,
    }

    impl EnvVarGuard {
        fn set(key: &'static str, value: &str) -> Self {
            let previous = std::env::var_os(key);
            std::env::set_var(key, value);
            Self { key, previous }
        }

        fn unset(key: &'static str) -> Self {
            let previous = std::env::var_os(key);
            std::env::remove_var(key);
            Self { key, previous }
        }
    }

    impl Drop for EnvVarGuard {
        fn drop(&mut self) {
            match &self.previous {
                Some(value) => std::env::set_var(self.key, value),
                None => std::env::remove_var(self.key),
            }
        }
    }

    struct TempHome {
        path: PathBuf,
    }

    impl TempHome {
        fn new() -> Self {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock should be after unix epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "chat-core-config-test-{}-{}",
                std::process::id(),
                nanos
            ));
            std::fs::create_dir_all(&path).expect("failed to create temp home dir");
            Self { path }
        }

        fn set_config_json(&self, content: &str) {
            let config_dir = self.path.join(".bodhi");
            std::fs::create_dir_all(&config_dir).expect("failed to create config dir");
            std::fs::write(config_dir.join("config.json"), content)
                .expect("failed to write config.json");
        }
    }

    impl Drop for TempHome {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

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

    #[test]
    fn config_new_ignores_http_proxy_env_vars() {
        let _lock = env_lock().lock().expect("env lock poisoned");
        let temp_home = TempHome::new();
        temp_home.set_config_json(
            r#"{
  "http_proxy": "",
  "https_proxy": ""
}"#,
        );

        let home = temp_home.path.to_string_lossy().to_string();
        let _home = EnvVarGuard::set("HOME", &home);
        let _http_proxy = EnvVarGuard::set("HTTP_PROXY", "http://env-proxy.example.com:8080");
        let _https_proxy = EnvVarGuard::set("HTTPS_PROXY", "http://env-proxy.example.com:8443");

        let config = Config::new();

        assert!(
            config.http_proxy.is_empty(),
            "config should ignore HTTP_PROXY env var"
        );
        assert!(
            config.https_proxy.is_empty(),
            "config should ignore HTTPS_PROXY env var"
        );
    }

    #[test]
    fn config_new_loads_config_when_proxy_fields_omitted() {
        let _lock = env_lock().lock().expect("env lock poisoned");
        let temp_home = TempHome::new();
        temp_home.set_config_json(
            r#"{
  "api_base": "https://api.example.com"
}"#,
        );

        let home = temp_home.path.to_string_lossy().to_string();
        let _home = EnvVarGuard::set("HOME", &home);
        let _http_proxy = EnvVarGuard::unset("HTTP_PROXY");
        let _https_proxy = EnvVarGuard::unset("HTTPS_PROXY");
        let _api_base = EnvVarGuard::unset("API_BASE");

        let config = Config::new();

        assert_eq!(
            config.api_base.as_deref(),
            Some("https://api.example.com"),
            "config should load api_base from config file even when proxy fields are omitted"
        );
        assert!(config.http_proxy.is_empty());
        assert!(config.https_proxy.is_empty());
    }

    #[test]
    fn config_new_ignores_proxy_env_vars_when_proxy_fields_omitted() {
        let _lock = env_lock().lock().expect("env lock poisoned");
        let temp_home = TempHome::new();
        temp_home.set_config_json(
            r#"{
  "api_base": "https://api.example.com"
}"#,
        );

        let home = temp_home.path.to_string_lossy().to_string();
        let _home = EnvVarGuard::set("HOME", &home);
        let _http_proxy = EnvVarGuard::set("HTTP_PROXY", "http://env-proxy.example.com:8080");
        let _https_proxy = EnvVarGuard::set("HTTPS_PROXY", "http://env-proxy.example.com:8443");

        let config = Config::new();

        assert_eq!(config.api_base.as_deref(), Some("https://api.example.com"));
        assert!(
            config.http_proxy.is_empty(),
            "config should keep http_proxy empty when field is omitted"
        );
        assert!(
            config.https_proxy.is_empty(),
            "config should keep https_proxy empty when field is omitted"
        );
    }
}
