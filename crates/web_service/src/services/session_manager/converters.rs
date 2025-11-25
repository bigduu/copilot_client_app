//! Type converters for tools and permissions

/// Convert tool_system ToolDefinition to context_manager ToolDefinition
pub(crate) fn convert_tool_definitions(
    tool_defs: Vec<tool_system::types::ToolDefinition>,
) -> Vec<context_manager::pipeline::context::ToolDefinition> {
    tool_defs
        .into_iter()
        .map(|def| {
            // Convert parameters Vec<Parameter> to JSON Schema
            let parameters_schema = if def.parameters.is_empty() {
                serde_json::json!({
                    "type": "object",
                    "properties": {},
                    "required": []
                })
            } else {
                let mut properties = serde_json::Map::new();
                let mut required = Vec::new();

                for param in &def.parameters {
                    let mut param_schema = serde_json::Map::new();
                    // Default to string type since Parameter doesn't have type info
                    param_schema.insert("type".to_string(), serde_json::json!("string"));
                    param_schema.insert(
                        "description".to_string(),
                        serde_json::json!(param.description),
                    );

                    properties.insert(param.name.clone(), serde_json::Value::Object(param_schema));

                    if param.required {
                        required.push(param.name.clone());
                    }
                }

                serde_json::json!({
                    "type": "object",
                    "properties": properties,
                    "required": required
                })
            };

            // Convert ToolCategory enum to string
            let category_str = format!("{:?}", def.category);

            context_manager::pipeline::context::ToolDefinition {
                name: def.name,
                description: def.description,
                category: category_str,
                parameters_schema,
                requires_approval: def.requires_approval,
            }
        })
        .collect()
}

/// Convert context_manager Permission to tool_system ToolPermission
pub(crate) fn convert_permissions(
    permissions: Vec<context_manager::structs::context_agent::Permission>,
) -> Vec<tool_system::types::ToolPermission> {
    permissions
        .into_iter()
        .map(|perm| match perm {
            context_manager::structs::context_agent::Permission::ReadFiles => {
                tool_system::types::ToolPermission::ReadFiles
            }
            context_manager::structs::context_agent::Permission::WriteFiles => {
                tool_system::types::ToolPermission::WriteFiles
            }
            context_manager::structs::context_agent::Permission::CreateFiles => {
                tool_system::types::ToolPermission::CreateFiles
            }
            context_manager::structs::context_agent::Permission::DeleteFiles => {
                tool_system::types::ToolPermission::DeleteFiles
            }
            context_manager::structs::context_agent::Permission::ExecuteCommands => {
                tool_system::types::ToolPermission::ExecuteCommands
            }
        })
        .collect()
}
