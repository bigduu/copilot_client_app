use copilot_agent_mcp::McpClient;
use copilot_agent_core::tools::{ToolExecutor, ToolCall, FunctionCall};

#[tokio::main]
async fn main() {
    println!("Testing tool execution...\n");
    
    let client = McpClient::new();
    
    // Test 1: get_current_dir
    println!("Test 1: get_current_dir");
    let call = ToolCall {
        id: "test1".to_string(),
        tool_type: "function".to_string(),
        function: FunctionCall {
            name: "get_current_dir".to_string(),
            arguments: "{}".to_string(),
        },
    };
    
    match client.execute(&call).await {
        Ok(result) => {
            println!("  Success: {}", result.success);
            println!("  Result: {}", result.result);
        }
        Err(e) => println!("  Error: {:?}", e),
    }
    
    // Test 2: execute_command (ls)
    println!("\nTest 2: execute_command (ls /tmp)");
    let call = ToolCall {
        id: "test2".to_string(),
        tool_type: "function".to_string(),
        function: FunctionCall {
            name: "execute_command".to_string(),
            arguments: r#"{"command": "ls", "args": ["/tmp"], "cwd": null}"#.to_string(),
        },
    };
    
    match client.execute(&call).await {
        Ok(result) => {
            println!("  Success: {}", result.success);
            println!("  Result preview: {}", &result.result[..result.result.len().min(200)]);
        }
        Err(e) => println!("  Error: {:?}", e),
    }
    
    // Test 3: write_file
    println!("\nTest 3: write_file");
    let call = ToolCall {
        id: "test3".to_string(),
        tool_type: "function".to_string(),
        function: FunctionCall {
            name: "write_file".to_string(),
            arguments: r#"{"path": "/tmp/copilot_agent_test.txt", "content": "Hello from Copilot Agent!"}"#.to_string(),
        },
    };
    
    match client.execute(&call).await {
        Ok(result) => {
            println!("  Success: {}", result.success);
            println!("  Result: {}", result.result);
        }
        Err(e) => println!("  Error: {:?}", e),
    }
    
    // Test 4: read_file
    println!("\nTest 4: read_file");
    let call = ToolCall {
        id: "test4".to_string(),
        tool_type: "function".to_string(),
        function: FunctionCall {
            name: "read_file".to_string(),
            arguments: r#"{"path": "/tmp/copilot_agent_test.txt"}"#.to_string(),
        },
    };
    
    match client.execute(&call).await {
        Ok(result) => {
            println!("  Success: {}", result.success);
            println!("  Content: {}", result.result);
        }
        Err(e) => println!("  Error: {:?}", e),
    }
    
    println!("\n✓ All tool execution tests completed!");
}
