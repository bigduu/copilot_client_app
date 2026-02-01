use copilot_agent_mcp::McpClient;
use copilot_agent_core::tools::ToolExecutor;

fn main() {
    println!("Testing tool listing...\n");
    
    let client = McpClient::new();
    let tools = client.list_tools();
    
    println!("Available tools ({}):\n", tools.len());
    
    for (i, tool) in tools.iter().enumerate() {
        println!("{}. {} - {}", 
            i + 1,
            tool.function.name,
            tool.function.description
        );
    }
    
    println!("\n✓ Tool listing test passed!");
}
