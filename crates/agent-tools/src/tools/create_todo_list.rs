use agent_core::tools::{Tool, ToolError, ToolResult};
use agent_core::{TodoItem, TodoItemStatus, TodoList};
use async_trait::async_trait;
use serde_json::json;

/// Tool for creating a todo list for the current session
pub struct CreateTodoListTool;

impl CreateTodoListTool {
    pub fn new() -> Self {
        Self
    }

    /// Format todo list as string for display
    pub fn format_todo_list(list: &TodoList) -> String {
        let mut output = format!("# {}\n\n", list.title);

        for item in &list.items {
            let status_icon = match item.status {
                TodoItemStatus::Pending => "[ ]",
                TodoItemStatus::InProgress => "[/]",
                TodoItemStatus::Completed => "[x]",
                TodoItemStatus::Blocked => "[!]",
            };

            output.push_str(&format!("{} {}: {}\n", status_icon, item.id, item.description));

            if !item.notes.is_empty() {
                output.push_str(&format!("    Notes: {}\n", item.notes));
            }

            if !item.depends_on.is_empty() {
                output.push_str(&format!("    Depends on: {}\n", item.depends_on.join(", ")));
            }
        }

        output.push_str(&format!(
            "\nProgress: {}/{} completed",
            list.items.iter().filter(|i| i.status == TodoItemStatus::Completed).count(),
            list.items.len()
        ));

        output
    }
}

impl Default for CreateTodoListTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for CreateTodoListTool {
    fn name(&self) -> &str {
        "create_todo_list"
    }

    fn description(&self) -> &str {
        "Create a structured todo list to track multi-step task progress. \
        IMPORTANT: When the user requests multiple tasks or complex work, \
        you MUST use this tool to create a formal todo list instead of writing markdown checklists. \
        This enables real-time progress tracking and automatic status updates. \
        After creation, the todo list will be displayed in the UI and the system will track progress automatically."
    }

    fn parameters_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Title of the todo list"
                },
                "items": {
                    "type": "array",
                    "description": "List of tasks",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {
                                "type": "string",
                                "description": "Unique identifier for the task, e.g., '1', '2', 'analyze-code'"
                            },
                            "description": {
                                "type": "string",
                                "description": "Task description"
                            },
                            "depends_on": {
                                "type": "array",
                                "items": { "type": "string" },
                                "description": "IDs of other tasks that this task depends on"
                            }
                        },
                        "required": ["id", "description"]
                    }
                }
            },
            "required": ["title", "items"]
        })
    }

    async fn execute(&self, args: serde_json::Value) -> Result<ToolResult, ToolError> {
        let title = args["title"]
            .as_str()
            .ok_or_else(|| ToolError::InvalidArguments("Missing 'title' parameter".to_string()))?;

        let items_array = args["items"]
            .as_array()
            .ok_or_else(|| ToolError::InvalidArguments("Missing 'items' parameter".to_string()))?;

        let mut items = Vec::new();
        for item_val in items_array {
            let id = item_val["id"]
                .as_str()
                .ok_or_else(|| ToolError::InvalidArguments("Item missing 'id'".to_string()))?
                .to_string();

            let description = item_val["description"]
                .as_str()
                .ok_or_else(|| ToolError::InvalidArguments("Item missing 'description'".to_string()))?
                .to_string();

            let depends_on: Vec<String> = item_val["depends_on"]
                .as_array()
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                .unwrap_or_default();

            items.push(TodoItem {
                id,
                description,
                status: TodoItemStatus::Pending,
                depends_on,
                notes: String::new(),
            });
        }

        let todo_list = TodoList {
            session_id: "current".to_string(), // Will be set by caller with actual session ID
            title: title.to_string(),
            items,
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };

        let formatted = Self::format_todo_list(&todo_list);

        // Return the todo list as JSON so it can be stored in session
        let result_json = serde_json::to_string(&todo_list)
            .map_err(|e| ToolError::Execution(e.to_string()))?;

        Ok(ToolResult {
            success: true,
            result: format!("{}", formatted),
            display_preference: None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_todo_list_tool_name() {
        let tool = CreateTodoListTool::new();
        assert_eq!(tool.name(), "create_todo_list");
    }
}
