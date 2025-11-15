//! Tool-to-prompt conversion for LLM injection

use crate::types::ToolDefinition;

/// JSON calling convention template for LLM
pub const TOOL_CALLING_INSTRUCTIONS: &str = r#"
# TOOL USAGE INSTRUCTIONS

You have access to tools that you can invoke by outputting a JSON object in this exact format:

```json
{
  "tool": "tool_name",
  "parameters": {
    "param1": "value1",
    "param2": "value2"
  },
  "terminate": true
}
```

## IMPORTANT RULES:

1. **Output ONLY the JSON** - Do not include any explanatory text before or after the JSON
2. **Terminate Flag** - Controls agent loop behavior:
   - `terminate: true` - This is your final action, return results to user
   - `terminate: false` - Continue working after this tool execution
3. **Parameters** - Must match the tool's parameter definitions exactly
4. **Tool Names** - Use exact tool names as listed below

## When to use terminate=true vs terminate=false:

- **terminate=true**: Use when you have gathered all necessary information and are ready to respond to the user, or when the tool represents a final action
- **terminate=false**: Use when you need to chain multiple tool calls together, or when you need to process the tool's output before responding

## AVAILABLE TOOLS:
"#;

/// Format a tool definition as XML/markdown for the system prompt
pub fn format_tool_as_xml(tool: &ToolDefinition) -> String {
    let mut output = String::new();

    output.push_str(&format!("### {}\n", tool.name));
    output.push_str(&format!("**Description**: {}\n\n", tool.description));

    if !tool.parameters.is_empty() {
        output.push_str("**Parameters**:\n");
        for param in &tool.parameters {
            let required = if param.required {
                "(required)"
            } else {
                "(optional)"
            };
            output.push_str(&format!(
                "- `{}` {}: {}\n",
                param.name, required, param.description
            ));
        }
        output.push('\n');
    } else {
        output.push_str("**Parameters**: None\n\n");
    }

    if tool.requires_approval {
        output.push_str("⚠️ *This tool requires user approval before execution*\n\n");
    }

    if let Some(ref termination_doc) = tool.termination_behavior_doc {
        output.push_str(&format!(
            "**Termination Guidance**: {}\n\n",
            termination_doc
        ));
    }

    if let Some(ref custom_prompt) = tool.custom_prompt {
        output.push_str(&format!("**Additional Notes**:\n{}\n\n", custom_prompt));
    }

    output.push_str("---\n\n");
    output
}

/// Format multiple tools into a complete system prompt section
pub fn format_tools_section(tools: &[ToolDefinition]) -> String {
    let mut output = String::new();

    // Add calling instructions
    output.push_str(TOOL_CALLING_INSTRUCTIONS);
    output.push('\n');

    // Add each tool definition
    for tool in tools {
        output.push_str(&format_tool_as_xml(tool));
    }

    output.push_str("\n## REMEMBER:\n");
    output.push_str("- Output ONLY valid JSON when calling tools\n");
    output.push_str("- Choose terminate=true or terminate=false based on whether you need to continue working\n");
    output.push_str("- You can call multiple tools in sequence by using terminate=false\n");
    output.push_str("- Always validate that your JSON is properly formatted\n");

    output
}

/// Create a simplified tool list (just names and descriptions)
pub fn format_tool_list(tools: &[ToolDefinition]) -> String {
    let mut output = String::from("Available tools:\n");
    for tool in tools {
        output.push_str(&format!("- `{}`: {}\n", tool.name, tool.description));
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Parameter;

    #[test]
    fn test_format_tool_as_xml() {
        let tool = ToolDefinition {
            name: "test_tool".to_string(),
            description: "A test tool".to_string(),
            parameters: vec![Parameter {
                name: "param1".to_string(),
                description: "First parameter".to_string(),
                required: true,
            }],
            requires_approval: false,
            category: Default::default(),
            tool_type: crate::types::ToolType::AIParameterParsing,
            parameter_regex: None,
            custom_prompt: None,
            hide_in_selector: false,
            display_preference: crate::types::DisplayPreference::Default,
            required_permissions: vec![],
            termination_behavior_doc: Some("Use terminate=false for multi-step tasks".to_string()),
        };

        let formatted = format_tool_as_xml(&tool);
        assert!(formatted.contains("### test_tool"));
        assert!(formatted.contains("A test tool"));
        assert!(formatted.contains("param1"));
        assert!(formatted.contains("First parameter"));
        assert!(formatted.contains("Termination Guidance"));
    }

    #[test]
    fn test_format_tools_section() {
        let tools = vec![
            ToolDefinition {
                name: "tool1".to_string(),
                description: "First tool".to_string(),
                parameters: vec![],
                requires_approval: false,
                category: Default::default(),
                tool_type: crate::types::ToolType::AIParameterParsing,
                parameter_regex: None,
                custom_prompt: None,
                hide_in_selector: false,
                display_preference: crate::types::DisplayPreference::Default,
                termination_behavior_doc: None,
                required_permissions: vec![],
            },
            ToolDefinition {
                name: "tool2".to_string(),
                description: "Second tool".to_string(),
                parameters: vec![],
                requires_approval: true,
                category: Default::default(),
                tool_type: crate::types::ToolType::AIParameterParsing,
                parameter_regex: None,
                custom_prompt: None,
                hide_in_selector: false,
                display_preference: crate::types::DisplayPreference::Default,
                termination_behavior_doc: None,
                required_permissions: vec![],
            },
        ];

        let formatted = format_tools_section(&tools);
        assert!(formatted.contains("TOOL USAGE INSTRUCTIONS"));
        assert!(formatted.contains("tool1"));
        assert!(formatted.contains("tool2"));
        assert!(formatted.contains("terminate"));
        assert!(formatted.contains("⚠️")); // Approval warning for tool2
    }

    #[test]
    fn test_format_tool_list() {
        let tools = vec![ToolDefinition {
            name: "read_file".to_string(),
            description: "Read file contents".to_string(),
            parameters: vec![],
            requires_approval: false,
            category: Default::default(),
            tool_type: crate::types::ToolType::AIParameterParsing,
            parameter_regex: None,
            custom_prompt: None,
            hide_in_selector: false,
            display_preference: crate::types::DisplayPreference::Default,
            termination_behavior_doc: None,
            required_permissions: vec![],
        }];

        let formatted = format_tool_list(&tools);
        assert!(formatted.contains("Available tools:"));
        assert!(formatted.contains("read_file"));
        assert!(formatted.contains("Read file contents"));
    }
}


