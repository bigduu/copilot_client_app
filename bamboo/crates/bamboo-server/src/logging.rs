use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;

/// 初始化日志系统
pub fn init_logging(debug: bool) {
    let filter = if debug {
        "debug"
    } else {
        "info"
    };
    
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or(filter))
        .format(|buf, record| {
            use std::io::Write;
            writeln!(
                buf,
                "[{}] {} [{}] {} - {}",
                chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f"),
                record.level(),
                record.target(),
                record.module_path().unwrap_or("unknown"),
                record.args()
            )
        })
        .init();
}

/// 结构化调试信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DebugInfo {
    pub session_id: String,
    pub event_type: String,
    pub timestamp: DateTime<Utc>,
    pub details: serde_json::Value,
}

impl DebugInfo {
    pub fn new(session_id: impl Into<String>, event_type: impl Into<String>) -> Self {
        Self {
            session_id: session_id.into(),
            event_type: event_type.into(),
            timestamp: Utc::now(),
            details: serde_json::json!({}),
        }
    }

    pub fn with_details(mut self, details: serde_json::Value) -> Self {
        self.details = details;
        self
    }

    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_default()
    }
}

/// 调试日志记录器
pub struct DebugLogger {
    enabled: bool,
    log_file: Option<PathBuf>,
}

impl DebugLogger {
    pub fn new(enabled: bool) -> Self {
        let log_file = if enabled {
            let data_dir = dirs::home_dir()
                .unwrap_or_else(|| std::env::temp_dir())
                .join(".bamboo");
            Some(data_dir.join("debug.log"))
        } else {
            None
        };

        Self { enabled, log_file }
    }

    pub fn log(&self, info: &DebugInfo) {
        if !self.enabled {
            return;
        }

        // 输出到标准日志
        log::debug!("[{}] {}: {}", 
            info.session_id, 
            info.event_type, 
            info.details
        );

        // 输出到文件
        if let Some(ref path) = self.log_file {
            if let Ok(mut file) = OpenOptions::new()
                .create(true)
                .append(true)
                .open(path)
            {
                let _ = writeln!(file, "{}", info.to_json());
            }
        }
    }

    pub fn log_event(&self, session_id: &str, event_type: &str, details: serde_json::Value) {
        let info = DebugInfo::new(session_id, event_type)
            .with_details(details);
        self.log(&info);
    }
}

/// 计时器，用于测量操作耗时
pub struct Timer {
    name: String,
    start: std::time::Instant,
}

impl Timer {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            start: std::time::Instant::now(),
        }
    }

    pub fn elapsed_ms(&self) -> u128 {
        self.start.elapsed().as_millis()
    }

    pub fn debug(&self, session_id: &str) {
        log::debug!("[{}] {} completed in {}ms", 
            session_id, 
            self.name, 
            self.elapsed_ms()
        );
    }
}

impl Drop for Timer {
    fn drop(&mut self) {
        // 可选：自动记录慢操作
        let elapsed = self.elapsed_ms();
        if elapsed > 1000 {
            log::warn!("{} took {}ms (slow!)", self.name, elapsed);
        }
    }
}
