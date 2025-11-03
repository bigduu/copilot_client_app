//! Agent service for orchestrating LLM tool call loops

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};
use log::{debug, info, warn};

/// Configuration for agent loop execution
#[derive(Debug, Clone)]
pub struct AgentLoopConfig {
    /// Maximum number of iterations in the agent loop
    pub max_iterations: usize,
    /// Total timeout for the entire agent execution
    pub timeout: Duration,
    /// Maximum retries for malformed JSON parsing
    pub max_json_parse_retries: usize,
    /// Maximum retries for tool execution failures
    pub max_tool_execution_retries: usize,
    /// Timeout for individual tool execution (in seconds)
    pub tool_execution_timeout: Duration,
}

impl Default for AgentLoopConfig {
    fn default() -> Self {
        Self {
            max_iterations: 10,
            timeout: Duration::from_secs(300), // 5 minutes
            max_json_parse_retries: 3,
            max_tool_execution_retries: 3,
            tool_execution_timeout: Duration::from_secs(60), // 1 minute per tool
        }
    }
}

/// State tracking for agent execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentLoopState {
    /// Current iteration number (1-based)
    pub iteration: usize,
    /// Start time of the agent loop (serialized as seconds since epoch)
    #[serde(skip, default = "Instant::now")]
    pub start_time: Instant,
    /// History of tool calls made in this loop
    pub tool_call_history: Vec<ToolCallRecord>,
    /// Number of JSON parse failures encountered
    pub parse_failures: usize,
    /// Number of consecutive tool execution failures
    pub tool_execution_failures: usize,
    /// Name of the current tool being retried (if any)
    pub current_retry_tool: Option<String>,
}

impl Default for AgentLoopState {
    fn default() -> Self {
        Self::new()
    }
}

impl AgentLoopState {
    pub fn new() -> Self {
        Self {
            iteration: 0,
            start_time: Instant::now(),
            tool_call_history: Vec::new(),
            parse_failures: 0,
            tool_execution_failures: 0,
            current_retry_tool: None,
        }
    }
    
    pub fn elapsed(&self) -> Duration {
        self.start_time.elapsed()
    }
    
    /// Record a tool execution failure
    pub fn record_tool_failure(&mut self, tool_name: &str) {
        if self.current_retry_tool.as_deref() == Some(tool_name) {
            self.tool_execution_failures += 1;
        } else {
            self.current_retry_tool = Some(tool_name.to_string());
            self.tool_execution_failures = 1;
        }
    }
    
    /// Reset tool execution failure counter (called on successful execution)
    pub fn reset_tool_failures(&mut self) {
        self.tool_execution_failures = 0;
        self.current_retry_tool = None;
    }
}

/// Record of a tool call made during agent execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallRecord {
    pub tool_name: String,
    pub parameters: serde_json::Value,
    pub result: Option<serde_json::Value>,
    pub terminate: bool,
}

/// Parsed tool call from LLM response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub tool: String,
    pub parameters: serde_json::Value,
    #[serde(default)]
    pub terminate: bool,
}

/// Agent service for managing LLM tool call loops
pub struct AgentService {
    config: AgentLoopConfig,
}

impl AgentService {
    pub fn new(config: AgentLoopConfig) -> Self {
        Self { config }
    }
    
    pub fn with_default_config() -> Self {
        Self::new(AgentLoopConfig::default())
    }
    
    /// Get the tool execution timeout duration
    pub fn tool_execution_timeout(&self) -> Duration {
        self.config.tool_execution_timeout
    }
    
    /// Get the max tool execution retries
    pub fn max_tool_execution_retries(&self) -> usize {
        self.config.max_tool_execution_retries
    }
    
    /// Parse a tool call from LLM response
    /// 
    /// Looks for JSON in the format:
    /// ```json
    /// {
    ///   "tool": "tool_name",
    ///   "parameters": { "param1": "value1" },
    ///   "terminate": true
    /// }
    /// ```
    pub fn parse_tool_call_from_response(&self, response: &str) -> Result<Option<ToolCall>> {
        debug!("Parsing tool call from response: {}", response);
        
        // Try to find JSON in the response
        // Look for content between triple backticks or raw JSON
        let json_str = if let Some(start) = response.find("```json") {
            if let Some(end) = response[start + 7..].find("```") {
                &response[start + 7..start + 7 + end]
            } else {
                response
            }
        } else if let Some(start) = response.find('{') {
            if let Some(end) = response.rfind('}') {
                &response[start..=end]
            } else {
                response
            }
        } else {
            return Ok(None);
        };
        
        // Try to parse as ToolCall
        match serde_json::from_str::<ToolCall>(json_str.trim()) {
            Ok(tool_call) => {
                debug!("Successfully parsed tool call: {:?}", tool_call);
                Ok(Some(tool_call))
            }
            Err(e) => {
                debug!("Failed to parse as tool call: {}", e);
                Ok(None)
            }
        }
    }
    
    /// Validate that a tool call has all required fields
    pub fn validate_tool_call(&self, tool_call: &ToolCall) -> Result<()> {
        if tool_call.tool.is_empty() {
            return Err(anyhow!("Tool name cannot be empty"));
        }
        
        if !tool_call.parameters.is_object() {
            return Err(anyhow!("Tool parameters must be a JSON object"));
        }
        
        Ok(())
    }
    
    /// Check if the agent loop should continue
    pub fn should_continue(&self, state: &AgentLoopState) -> Result<bool> {
        // Check iteration limit
        if state.iteration >= self.config.max_iterations {
            warn!("Agent loop reached max iterations ({})", self.config.max_iterations);
            return Ok(false);
        }
        
        // Check timeout
        if state.elapsed() >= self.config.timeout {
            warn!("Agent loop timed out after {:?}", state.elapsed());
            return Ok(false);
        }
        
        // Check parse failure limit
        if state.parse_failures >= self.config.max_json_parse_retries {
            warn!("Agent loop exceeded max JSON parse retries ({})", self.config.max_json_parse_retries);
            return Ok(false);
        }
        
        // Check tool execution failure limit
        if state.tool_execution_failures >= self.config.max_tool_execution_retries {
            warn!(
                "Agent loop exceeded max tool execution retries ({}) for tool '{}'",
                self.config.max_tool_execution_retries,
                state.current_retry_tool.as_deref().unwrap_or("unknown")
            );
            return Ok(false);
        }
        
        Ok(true)
    }
    
    /// Create feedback message for LLM when tool call parsing fails
    pub fn create_parse_error_feedback(&self, error: &str) -> String {
        format!(
            "I couldn't parse your tool call. Please provide a valid JSON object with this exact format:\n\n\
             ```json\n\
             {{\n  \
               \"tool\": \"tool_name\",\n  \
               \"parameters\": {{ \"param\": \"value\" }},\n  \
               \"terminate\": true\n\
             }}\n\
             ```\n\n\
             Error: {}\n\n\
             Please try again with valid JSON.",
            error
        )
    }
    
    /// Create feedback message for LLM when tool execution fails
    pub fn create_tool_error_feedback(&self, tool_name: &str, error: &str) -> String {
        format!(
            "Tool '{}' execution failed with error: {}\n\n\
             Please analyze the error and either:\n\
             1. Retry with different parameters if the error is fixable\n\
             2. Use a different approach to accomplish the task\n\
             3. Set terminate=true to return results to the user",
            tool_name, error
        )
    }
    
    /// Log agent loop event for monitoring
    pub fn log_agent_event(&self, state: &AgentLoopState, event: &str) {
        info!(
            "[Agent Loop] Iteration {}/{}, Elapsed: {:?}, Event: {}",
            state.iteration,
            self.config.max_iterations,
            state.elapsed(),
            event
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_parse_tool_call_valid_json() {
        let service = AgentService::with_default_config();
        let response = r#"{"tool": "read_file", "parameters": {"path": "/test.txt"}, "terminate": false}"#;
        
        let result = service.parse_tool_call_from_response(response).unwrap();
        assert!(result.is_some());
        
        let tool_call = result.unwrap();
        assert_eq!(tool_call.tool, "read_file");
        assert_eq!(tool_call.terminate, false);
    }
    
    #[test]
    fn test_parse_tool_call_with_markdown() {
        let service = AgentService::with_default_config();
        let response = r#"I'll read the file:
        
```json
{"tool": "read_file", "parameters": {"path": "/test.txt"}, "terminate": true}
```
"#;
        
        let result = service.parse_tool_call_from_response(response).unwrap();
        assert!(result.is_some());
        
        let tool_call = result.unwrap();
        assert_eq!(tool_call.tool, "read_file");
        assert_eq!(tool_call.terminate, true);
    }
    
    #[test]
    fn test_parse_tool_call_no_json() {
        let service = AgentService::with_default_config();
        let response = "This is just a regular text response.";
        
        let result = service.parse_tool_call_from_response(response).unwrap();
        assert!(result.is_none());
    }
    
    #[test]
    fn test_validate_tool_call_valid() {
        let service = AgentService::with_default_config();
        let tool_call = ToolCall {
            tool: "read_file".to_string(),
            parameters: serde_json::json!({"path": "/test.txt"}),
            terminate: false,
        };
        
        assert!(service.validate_tool_call(&tool_call).is_ok());
    }
    
    #[test]
    fn test_validate_tool_call_empty_name() {
        let service = AgentService::with_default_config();
        let tool_call = ToolCall {
            tool: "".to_string(),
            parameters: serde_json::json!({"path": "/test.txt"}),
            terminate: false,
        };
        
        assert!(service.validate_tool_call(&tool_call).is_err());
    }
    
    #[test]
    fn test_should_continue_iteration_limit() {
        let config = AgentLoopConfig {
            max_iterations: 3,
            ..Default::default()
        };
        let service = AgentService::new(config);
        
        let mut state = AgentLoopState::new();
        state.iteration = 3;
        
        assert!(!service.should_continue(&state).unwrap());
    }
    
    #[test]
    fn test_should_continue_within_limits() {
        let service = AgentService::with_default_config();
        let mut state = AgentLoopState::new();
        state.iteration = 2;
        
        assert!(service.should_continue(&state).unwrap());
    }
}

