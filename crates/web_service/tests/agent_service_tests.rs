//! Unit tests for AgentService

use web_service::services::agent_service::{AgentService, AgentLoopConfig};

#[test]
fn test_parse_valid_json_tool_call() {
    let agent_service = AgentService::with_default_config();
    let response = r#"
    Here's what I'll do:
    {
        "tool": "read_file",
        "parameters": {"path": "/test.txt"},
        "terminate": false
    }
    "#;
    
    let result = agent_service.parse_tool_call_from_response(response);
    assert!(result.is_ok());
    
    let tool_call_opt = result.unwrap();
    assert!(tool_call_opt.is_some());
    
    let tool_call = tool_call_opt.unwrap();
    assert_eq!(tool_call.tool, "read_file");
    assert_eq!(tool_call.parameters["path"], "/test.txt");
    assert_eq!(tool_call.terminate, false);
}

#[test]
fn test_parse_json_with_terminate_true() {
    let agent_service = AgentService::with_default_config();
    let response = r#"
    {
        "tool": "write_file",
        "parameters": {"path": "/output.txt", "content": "Hello"},
        "terminate": true
    }
    "#;
    
    let result = agent_service.parse_tool_call_from_response(response);
    assert!(result.is_ok());
    
    let tool_call_opt = result.unwrap();
    assert!(tool_call_opt.is_some());
    
    let tool_call = tool_call_opt.unwrap();
    assert_eq!(tool_call.terminate, true);
}

#[test]
fn test_parse_json_only_tool_call() {
    let agent_service = AgentService::with_default_config();
    // LLM returns ONLY the JSON, no explanation
    let response = r#"{"tool": "search_code", "parameters": {"query": "test"}, "terminate": false}"#;
    
    let result = agent_service.parse_tool_call_from_response(response);
    assert!(result.is_ok());
    
    let tool_call_opt = result.unwrap();
    assert!(tool_call_opt.is_some());
    
    let tool_call = tool_call_opt.unwrap();
    assert_eq!(tool_call.tool, "search_code");
}

#[test]
fn test_parse_json_with_markdown_code_blocks() {
    let agent_service = AgentService::with_default_config();
    // LLM wraps JSON in markdown code blocks
    let response = r#"
    I'll use the read_file tool:
    ```json
    {
        "tool": "read_file",
        "parameters": {"path": "/config.json"},
        "terminate": false
    }
    ```
    "#;
    
    let result = agent_service.parse_tool_call_from_response(response);
    assert!(result.is_ok());
    
    let tool_call_opt = result.unwrap();
    assert!(tool_call_opt.is_some());
    
    let tool_call = tool_call_opt.unwrap();
    assert_eq!(tool_call.tool, "read_file");
}

#[test]
fn test_parse_no_json_in_response() {
    let agent_service = AgentService::with_default_config();
    let response = "This is just a regular text response with no JSON";
    
    let result = agent_service.parse_tool_call_from_response(response);
    assert!(result.is_ok());
    
    let tool_call_opt = result.unwrap();
    assert!(tool_call_opt.is_none());
}

#[test]
fn test_parse_malformed_json() {
    let agent_service = AgentService::with_default_config();
    let response = r#"
    {
        "tool": "read_file",
        "parameters": {"path": "/test.txt"},
        // Missing closing brace
    "#;
    
    let result = agent_service.parse_tool_call_from_response(response);
    assert!(result.is_ok());
    
    let tool_call_opt = result.unwrap();
    assert!(tool_call_opt.is_none());
}

#[test]
fn test_parse_json_with_extra_fields() {
    let agent_service = AgentService::with_default_config();
    // LLM includes extra fields not in spec
    let response = r#"
    {
        "tool": "read_file",
        "parameters": {"path": "/test.txt"},
        "terminate": false,
        "reasoning": "I need to read this file first",
        "confidence": 0.95
    }
    "#;
    
    let result = agent_service.parse_tool_call_from_response(response);
    assert!(result.is_ok()); // Should tolerate extra fields
    
    let tool_call_opt = result.unwrap();
    assert!(tool_call_opt.is_some());
    
    let tool_call = tool_call_opt.unwrap();
    assert_eq!(tool_call.tool, "read_file");
}

#[test]
fn test_parse_nested_json_in_parameters() {
    let agent_service = AgentService::with_default_config();
    let response = r#"
    {
        "tool": "complex_tool",
        "parameters": {
            "config": {
                "nested": {
                    "value": 123
                }
            }
        },
        "terminate": false
    }
    "#;
    
    let result = agent_service.parse_tool_call_from_response(response);
    assert!(result.is_ok());
    
    let tool_call_opt = result.unwrap();
    assert!(tool_call_opt.is_some());
    
    let tool_call = tool_call_opt.unwrap();
    assert_eq!(tool_call.parameters["config"]["nested"]["value"], 123);
}

#[test]
fn test_validate_tool_call_valid() {
    use web_service::services::agent_service::ToolCall;
    
    let agent_service = AgentService::with_default_config();
    let tool_call = ToolCall {
        tool: "read_file".to_string(),
        parameters: serde_json::json!({"path": "/test.txt"}),
        terminate: false,
    };
    
    let result = agent_service.validate_tool_call(&tool_call);
    assert!(result.is_ok());
}

#[test]
fn test_validate_tool_call_empty_tool_name() {
    use web_service::services::agent_service::ToolCall;
    
    let agent_service = AgentService::with_default_config();
    let tool_call = ToolCall {
        tool: "".to_string(),
        parameters: serde_json::json!({"path": "/test.txt"}),
        terminate: false,
    };
    
    let result = agent_service.validate_tool_call(&tool_call);
    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("empty"));
}

#[test]
fn test_validate_tool_call_null_parameters() {
    use web_service::services::agent_service::ToolCall;
    
    let agent_service = AgentService::with_default_config();
    let tool_call = ToolCall {
        tool: "read_file".to_string(),
        parameters: serde_json::Value::Null,
        terminate: false,
    };
    
    let result = agent_service.validate_tool_call(&tool_call);
    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("object"));
}

#[test]
fn test_parse_with_explanation_before_json() {
    let agent_service = AgentService::with_default_config();
    // LLM provides explanation before JSON
    let response = r#"
    I'll read the file first to understand its contents.
    
    {
        "tool": "read_file",
        "parameters": {"path": "/test.txt"},
        "terminate": false
    }
    "#;
    
    let result = agent_service.parse_tool_call_from_response(response);
    assert!(result.is_ok());
    
    let tool_call_opt = result.unwrap();
    assert!(tool_call_opt.is_some());
    
    let tool_call = tool_call_opt.unwrap();
    assert_eq!(tool_call.tool, "read_file");
}

#[test]
fn test_parse_json_with_string_escaping() {
    let agent_service = AgentService::with_default_config();
    let response = r#"
    {
        "tool": "write_file",
        "parameters": {
            "path": "/test.txt",
            "content": "Line 1\nLine 2\n\tIndented"
        },
        "terminate": false
    }
    "#;
    
    let result = agent_service.parse_tool_call_from_response(response);
    assert!(result.is_ok());
    
    let tool_call_opt = result.unwrap();
    assert!(tool_call_opt.is_some());
    
    let tool_call = tool_call_opt.unwrap();
    let content = tool_call.parameters["content"].as_str().unwrap();
    assert!(content.contains("\n"));
    assert!(content.contains("\t"));
}

#[test]
fn test_agent_loop_config_defaults() {
    let config = AgentLoopConfig::default();
    assert_eq!(config.max_iterations, 10);
    assert_eq!(config.max_json_parse_retries, 3);
    assert_eq!(config.max_tool_execution_retries, 3);
}

#[test]
fn test_agent_service_getters() {
    let config = AgentLoopConfig {
        max_iterations: 5,
        timeout: std::time::Duration::from_secs(60),
        max_json_parse_retries: 2,
        max_tool_execution_retries: 2,
        tool_execution_timeout: std::time::Duration::from_secs(30),
    };
    
    let agent_service = AgentService::new(config.clone());
    assert_eq!(agent_service.tool_execution_timeout(), std::time::Duration::from_secs(30));
    assert_eq!(agent_service.max_tool_execution_retries(), 2);
}
