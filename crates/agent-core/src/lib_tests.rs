#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::{Message, Role, Session};
    use crate::tools::{FunctionCall, FunctionSchema, ToolCall, ToolResult, ToolSchema};

    #[test]
    fn test_session_creation() {
        let session = Session::new("test-123");
        assert_eq!(session.id, "test-123");
        assert!(session.messages.is_empty());
    }

    #[test]
    fn test_message_creation() {
        let msg = Message::user("Hello");
        assert_eq!(msg.content, "Hello");
        assert!(matches!(msg.role, Role::User));
        assert!(!msg.id.is_empty());
    }

    #[test]
    fn test_session_add_message() {
        let mut session = Session::new("test");
        let msg = Message::user("Test message");
        session.add_message(msg);

        assert_eq!(session.messages.len(), 1);
        assert_eq!(session.messages[0].content, "Test message");
    }

    #[test]
    fn test_tool_call_creation() {
        let tool_call = ToolCall {
            id: "call-1".to_string(),
            tool_type: "function".to_string(),
            function: FunctionCall {
                name: "test_tool".to_string(),
                arguments: r#"{"key": "value"}"#.to_string(),
            },
        };

        assert_eq!(tool_call.id, "call-1");
        assert_eq!(tool_call.function.name, "test_tool");
    }

    #[test]
    fn test_tool_result_creation() {
        let result = ToolResult {
            success: true,
            result: "Success output".to_string(),
            display_preference: Some("text".to_string()),
        };

        assert!(result.success);
        assert_eq!(result.result, "Success output");
    }

    #[test]
    fn test_tool_schema_creation() {
        let schema = ToolSchema {
            schema_type: "function".to_string(),
            function: FunctionSchema {
                name: "test".to_string(),
                description: "Test tool".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {}
                }),
            },
        };

        assert_eq!(schema.function.name, "test");
    }

    #[test]
    fn test_assistant_message_with_tool_calls() {
        let tool_calls = vec![ToolCall {
            id: "call-1".to_string(),
            tool_type: "function".to_string(),
            function: FunctionCall {
                name: "get_weather".to_string(),
                arguments: r#"{"city": "Beijing"}"#.to_string(),
            },
        }];

        let msg = Message::assistant("", Some(tool_calls));
        assert!(msg.tool_calls.is_some());
        assert_eq!(msg.tool_calls.as_ref().unwrap().len(), 1);
    }

    #[test]
    fn test_tool_result_message() {
        let msg = Message::tool_result("call-1", "Sunny, 25°C");
        assert!(matches!(msg.role, Role::Tool));
        assert_eq!(msg.tool_call_id, Some("call-1".to_string()));
        assert_eq!(msg.content, "Sunny, 25°C");
    }

    #[test]
    fn test_tool_message_serialization() {
        let msg = Message::tool_result("call_yyaeEH9yC4MEL0kc5fWJwOZv", "User selected: option1");
        let json = serde_json::to_string(&msg).unwrap();
        println!("Serialized tool message: {}", json);

        // Verify the JSON structure
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["role"], "tool");
        assert_eq!(parsed["content"], "User selected: option1");
        assert_eq!(parsed["tool_call_id"], "call_yyaeEH9yC4MEL0kc5fWJwOZv");

        // Ensure tool_call_id field exists with correct name
        assert!(parsed.get("tool_call_id").is_some(), "tool_call_id field should exist");
    }

    #[test]
    fn test_assistant_with_tool_calls_serialization() {
        use crate::tools::{ToolCall, FunctionCall};

        let tool_calls = vec![ToolCall {
            id: "call_yyaeEH9yC4MEL0kc5fWJwOZv".to_string(),
            tool_type: "function".to_string(),
            function: FunctionCall {
                name: "ask_user".to_string(),
                arguments: r#"{"question": "test"}"#.to_string(),
            },
        }];

        let msg = Message::assistant("", Some(tool_calls));
        let json = serde_json::to_string(&msg).unwrap();
        println!("Serialized assistant message: {}", json);

        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["role"], "assistant");
        assert!(parsed.get("tool_calls").is_some(), "tool_calls field should exist");
    }
}
