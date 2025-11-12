//! Configuration management for web service
//!
//! Supports loading configuration from environment variables with fallback to defaults.

use crate::services::agent_service::AgentLoopConfig;
use std::time::Duration;

/// Load AgentLoopConfig from environment variables
///
/// Environment variables:
/// - `AGENT_MAX_ITERATIONS`: Maximum agent loop iterations (default: 10)
/// - `AGENT_TIMEOUT_SECS`: Total timeout in seconds (default: 300)
/// - `AGENT_MAX_JSON_RETRIES`: Max JSON parse retries (default: 3)
/// - `AGENT_MAX_TOOL_RETRIES`: Max tool execution retries (default: 3)
/// - `AGENT_TOOL_TIMEOUT_SECS`: Tool execution timeout in seconds (default: 60)
pub fn load_agent_loop_config() -> AgentLoopConfig {
    AgentLoopConfig {
        max_iterations: std::env::var("AGENT_MAX_ITERATIONS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(10),
        timeout: Duration::from_secs(
            std::env::var("AGENT_TIMEOUT_SECS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(300),
        ),
        max_json_parse_retries: std::env::var("AGENT_MAX_JSON_RETRIES")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(3),
        max_tool_execution_retries: std::env::var("AGENT_MAX_TOOL_RETRIES")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(3),
        tool_execution_timeout: Duration::from_secs(
            std::env::var("AGENT_TOOL_TIMEOUT_SECS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(60),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_agent_loop_config_has_sensible_defaults() {
        let config = load_agent_loop_config();
        // Should have positive values
        assert!(config.max_iterations > 0);
        assert!(config.timeout.as_secs() > 0);
        assert!(config.max_json_parse_retries > 0);
        assert!(config.max_tool_execution_retries > 0);
        assert!(config.tool_execution_timeout.as_secs() > 0);
    }
}
