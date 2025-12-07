//! TODO list operations for ChatContext

use crate::structs::{
    context::ChatContext,
    message::{ContentPart, InternalMessage, MessageNode, Role},
    message_types::{RichMessageType, TodoItemStatus, TodoListMsg, TodoListStatus},
    metadata::MessageMetadata,
};
use uuid::Uuid;

impl ChatContext {
    /// Create a new TODO list as an assistant message with RichMessageType::TodoList
    pub fn create_todo_list(
        &mut self,
        title: String,
        items: Vec<String>,
        description: Option<String>,
    ) -> Uuid {
        let message_id = Uuid::new_v4();
        let todo_list = TodoListMsg::new(title.clone(), items, description, message_id);
        let list_id = todo_list.list_id;

        // Create internal message with TODO list
        let internal_msg = InternalMessage {
            role: Role::Assistant,
            content: vec![ContentPart::text(&format!(
                "# {}\n\nTODO list created with {} items.",
                title,
                todo_list.items.len()
            ))],
            tool_calls: None,
            tool_result: None,
            metadata: Some(MessageMetadata::default()),
            message_type: crate::structs::message::MessageType::Text,
            rich_type: Some(RichMessageType::TodoList(todo_list)),
        };

        // Get the parent message ID from active branch (last message in the branch)
        let active_branch = self
            .branches
            .get(&self.active_branch_name)
            .expect("Active branch must exist");

        let parent_id = active_branch.message_ids.last().copied();

        // Create message node
        let node = MessageNode {
            id: message_id,
            message: internal_msg,
            parent_id,
        };

        // Add to message pool
        self.message_pool.insert(message_id, node);

        // Update active branch by adding the new message ID
        if let Some(branch) = self.branches.get_mut(&self.active_branch_name) {
            branch.message_ids.push(message_id);
        }

        self.mark_dirty();

        list_id
    }

    /// Update a TODO item status in an existing TODO list
    pub fn update_todo_item(
        &mut self,
        list_id: Uuid,
        item_id: Uuid,
        new_status: TodoItemStatus,
    ) -> Result<(), String> {
        // Find message containing this TODO list
        for (_, node) in self.message_pool.iter_mut() {
            if let Some(RichMessageType::TodoList(ref mut todo_list)) = node.message.rich_type {
                if todo_list.list_id == list_id {
                    // Update the item status
                    todo_list.update_item_status(item_id, new_status)?;
                    self.mark_dirty();
                    return Ok(());
                }
            }
        }

        Err(format!("TODO list {} not found", list_id))
    }

    /// Get all TODO lists in this context
    pub fn get_todo_lists(&self) -> Vec<&TodoListMsg> {
        self.message_pool
            .values()
            .filter_map(|node| {
                if let Some(RichMessageType::TodoList(ref todo_list)) = node.message.rich_type {
                    Some(todo_list)
                } else {
                    None
                }
            })
            .collect()
    }

    /// Get a specific TODO list by its list_id
    pub fn get_todo_list(&self, list_id: Uuid) -> Option<&TodoListMsg> {
        self.message_pool.values().find_map(|node| {
            if let Some(RichMessageType::TodoList(ref todo_list)) = node.message.rich_type {
                if todo_list.list_id == list_id {
                    return Some(todo_list);
                }
            }
            None
        })
    }

    /// Get active TODO lists (status = Active)
    pub fn get_active_todo_lists(&self) -> Vec<&TodoListMsg> {
        self.get_todo_lists()
            .into_iter()
            .filter(|todo_list| todo_list.status == TodoListStatus::Active)
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_todo_list() {
        let mut context =
            ChatContext::new(Uuid::new_v4(), "test_model".to_string(), "test".to_string());

        let items = vec![
            "Step 1".to_string(),
            "Step 2".to_string(),
            "Step 3".to_string(),
        ];

        let list_id = context.create_todo_list(
            "Test TODO".to_string(),
            items.clone(),
            Some("Test description".to_string()),
        );

        // Verify list was created
        let todo_list = context
            .get_todo_list(list_id)
            .expect("TODO list should exist");
        assert_eq!(todo_list.title, "Test TODO");
        assert_eq!(todo_list.items.len(), 3);
        assert_eq!(todo_list.status, TodoListStatus::Active);
    }

    #[test]
    fn test_update_todo_item() {
        let mut context =
            ChatContext::new(Uuid::new_v4(), "test_model".to_string(), "test".to_string());

        let items = vec!["Step 1".to_string(), "Step 2".to_string()];
        let list_id = context.create_todo_list("Test".to_string(), items, None);

        let todo_list = context.get_todo_list(list_id).unwrap();
        let item_id = todo_list.items[0].id;

        // Update first item to InProgress
        context
            .update_todo_item(list_id, item_id, TodoItemStatus::InProgress)
            .unwrap();

        let updated_list = context.get_todo_list(list_id).unwrap();
        assert_eq!(updated_list.items[0].status, TodoItemStatus::InProgress);
    }

    #[test]
    fn test_get_all_todo_lists() {
        let mut context =
            ChatContext::new(Uuid::new_v4(), "test_model".to_string(), "test".to_string());

        context.create_todo_list("List 1".to_string(), vec!["Item 1".to_string()], None);
        context.create_todo_list("List 2".to_string(), vec!["Item 2".to_string()], None);

        let lists = context.get_todo_lists();
        assert_eq!(lists.len(), 2);
    }

    #[test]
    fn test_get_active_todo_lists() {
        let mut context =
            ChatContext::new(Uuid::new_v4(), "test_model".to_string(), "test".to_string());

        let list_id1 =
            context.create_todo_list("List 1".to_string(), vec!["Item 1".to_string()], None);
        context.create_todo_list("List 2".to_string(), vec!["Item 2".to_string()], None);

        // Complete all items in list 1 to mark it completed
        let list1 = context.get_todo_list(list_id1).unwrap();
        let item_id = list1.items[0].id;
        context
            .update_todo_item(list_id1, item_id, TodoItemStatus::Completed)
            .unwrap();

        let active_lists = context.get_active_todo_lists();
        // Only List 2 should be active now
        assert_eq!(active_lists.len(), 1);
        assert_eq!(active_lists[0].title, "List 2");
    }

    #[test]
    fn test_context_dirty_flag() {
        let mut context =
            ChatContext::new(Uuid::new_v4(), "test_model".to_string(), "test".to_string());

        // Create list should mark context dirty
        let list_id = context.create_todo_list("Test".to_string(), vec!["Item".to_string()], None);
        assert!(context.is_dirty());

        // Clear dirty flag
        context.clear_dirty();
        assert!(!context.is_dirty());

        // Update item should mark context dirty
        let list = context.get_todo_list(list_id).unwrap();
        let item_id = list.items[0].id;
        context
            .update_todo_item(list_id, item_id, TodoItemStatus::Completed)
            .unwrap();
        assert!(context.is_dirty());
    }
}
