//! TODO list message types for multi-step task tracking

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// TODO list message - embedded in chat context via RichMessageType
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TodoListMsg {
    /// Unique identifier for this TODO list
    pub list_id: Uuid,

    /// List title
    pub title: String,

    /// Optional description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    /// TODO items
    pub items: Vec<TodoItem>,

    /// Overall status
    pub status: TodoListStatus,

    /// When created
    pub created_at: DateTime<Utc>,

    /// Last update time
    pub updated_at: DateTime<Utc>,

    /// Associated message ID (the message containing this TODO list)
    pub message_id: Uuid,
}

/// A single TODO item
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TodoItem {
    pub id: Uuid,
    pub description: String,
    pub status: TodoItemStatus,
    pub order: usize,

    /// Optional metadata (e.g., tool call result, error details)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

/// Status of individual TODO items
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TodoItemStatus {
    /// [ ] - Not started
    Pending,
    /// [/] - Currently working on this
    InProgress,
    /// [x] - Completed successfully
    Completed,
    /// [-] - Skipped or not needed
    Skipped,
    /// [!] - Failed with error
    Failed,
}

/// Overall TODO list status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TodoListStatus {
    /// List is active and being worked on
    Active,
    /// All items completed
    Completed,
    /// List was abandoned or cancelled
    Abandoned,
}

impl TodoListMsg {
    /// Create a new TODO list
    pub fn new(
        title: String,
        items: Vec<String>,
        description: Option<String>,
        message_id: Uuid,
    ) -> Self {
        let list_id = Uuid::new_v4();
        let now = Utc::now();

        let todo_items: Vec<TodoItem> = items
            .into_iter()
            .enumerate()
            .map(|(i, desc)| TodoItem {
                id: Uuid::new_v4(),
                description: desc,
                status: TodoItemStatus::Pending,
                order: i,
                metadata: None,
            })
            .collect();

        Self {
            list_id,
            title,
            description,
            items: todo_items,
            status: TodoListStatus::Active,
            created_at: now,
            updated_at: now,
            message_id,
        }
    }

    /// Update the status of a specific item
    pub fn update_item_status(
        &mut self,
        item_id: Uuid,
        new_status: TodoItemStatus,
    ) -> Result<(), String> {
        if let Some(item) = self.items.iter_mut().find(|i| i.id == item_id) {
            item.status = new_status;
            self.updated_at = Utc::now();

            // Update overall status if all items are completed
            if self.items.iter().all(|i| {
                matches!(
                    i.status,
                    TodoItemStatus::Completed | TodoItemStatus::Skipped
                )
            }) {
                self.status = TodoListStatus::Completed;
            }

            Ok(())
        } else {
            Err(format!("Item with id {} not found", item_id))
        }
    }

    /// Get completion percentage (0-100)
    pub fn completion_percentage(&self) -> f32 {
        if self.items.is_empty() {
            return 0.0;
        }

        let completed = self
            .items
            .iter()
            .filter(|i| i.status == TodoItemStatus::Completed)
            .count();

        (completed as f32 / self.items.len() as f32) * 100.0
    }

    /// Get the current item being worked on (in_progress)
    pub fn current_item(&self) -> Option<&TodoItem> {
        self.items
            .iter()
            .find(|i| i.status == TodoItemStatus::InProgress)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_todo_list() {
        let items = vec![
            "Step 1".to_string(),
            "Step 2".to_string(),
            "Step 3".to_string(),
        ];
        let message_id = Uuid::new_v4();

        let todo = TodoListMsg::new(
            "Test List".to_string(),
            items,
            Some("Test description".to_string()),
            message_id,
        );

        assert_eq!(todo.title, "Test List");
        assert_eq!(todo.items.len(), 3);
        assert_eq!(todo.status, TodoListStatus::Active);
        assert_eq!(todo.items[0].order, 0);
        assert_eq!(todo.items[1].order, 1);
        assert_eq!(todo.items[2].order, 2);
    }

    #[test]
    fn test_update_item_status() {
        let items = vec!["Step 1".to_string(), "Step 2".to_string()];
        let message_id = Uuid::new_v4();
        let mut todo = TodoListMsg::new("Test".to_string(), items, None, message_id);

        let item_id = todo.items[0].id;
        let result = todo.update_item_status(item_id, TodoItemStatus::Completed);

        assert!(result.is_ok());
        assert_eq!(todo.items[0].status, TodoItemStatus::Completed);
    }

    #[test]
    fn test_completion_percentage() {
        let items = vec![
            "Step 1".to_string(),
            "Step 2".to_string(),
            "Step 3".to_string(),
            "Step 4".to_string(),
        ];
        let message_id = Uuid::new_v4();
        let mut todo = TodoListMsg::new("Test".to_string(), items, None, message_id);

        // Initially 0%
        assert_eq!(todo.completion_percentage(), 0.0);

        // Complete 2 out of 4 = 50%
        todo.items[0].status = TodoItemStatus::Completed;
        todo.items[1].status = TodoItemStatus::Completed;
        assert_eq!(todo.completion_percentage(), 50.0);

        // Complete all = 100%
        todo.items[2].status = TodoItemStatus::Completed;
        todo.items[3].status = TodoItemStatus::Completed;
        assert_eq!(todo.completion_percentage(), 100.0);
    }

    #[test]
    fn test_auto_complete_status() {
        let items = vec!["Step 1".to_string(), "Step 2".to_string()];
        let message_id = Uuid::new_v4();
        let mut todo = TodoListMsg::new("Test".to_string(), items, None, message_id);

        assert_eq!(todo.status, TodoListStatus::Active);

        // Complete all items
        let item1_id = todo.items[0].id;
        let item2_id = todo.items[1].id;

        todo.update_item_status(item1_id, TodoItemStatus::Completed)
            .unwrap();
        assert_eq!(todo.status, TodoListStatus::Active);

        todo.update_item_status(item2_id, TodoItemStatus::Completed)
            .unwrap();
        assert_eq!(todo.status, TodoListStatus::Completed);
    }

    #[test]
    fn test_current_item() {
        let items = vec![
            "Step 1".to_string(),
            "Step 2".to_string(),
            "Step 3".to_string(),
        ];
        let message_id = Uuid::new_v4();
        let mut todo = TodoListMsg::new("Test".to_string(), items, None, message_id);

        // No current item initially
        assert!(todo.current_item().is_none());

        // Set item 2 as in progress
        todo.items[1].status = TodoItemStatus::InProgress;
        let current = todo.current_item();
        assert!(current.is_some());
        assert_eq!(current.unwrap().description, "Step 2");
    }

    #[test]
    fn test_serialization() {
        let items = vec!["Step 1".to_string()];
        let message_id = Uuid::new_v4();
        let todo = TodoListMsg::new("Test".to_string(), items, None, message_id);

        let serialized = serde_json::to_string(&todo).unwrap();
        let deserialized: TodoListMsg = serde_json::from_str(&serialized).unwrap();

        assert_eq!(todo, deserialized);
    }
}
