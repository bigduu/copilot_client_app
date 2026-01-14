//! TodoManager implementation
//!
//! Central hub for managing the full lifecycle of TodoLists and TodoItems.

use std::collections::HashMap;
use thiserror::Error;
use uuid::Uuid;

use chat_core::todo::{TodoItem, TodoList};

#[derive(Error, Debug)]
pub enum TodoManagerError {
    #[error("TodoList not found: {0}")]
    ListNotFound(Uuid),

    #[error("TodoItem not found: {0}")]
    ItemNotFound(Uuid),

    #[error("Item {0} is not in list {1}")]
    ItemNotInList(Uuid, Uuid),
}

/// Manages the collection of TodoLists for a context
#[derive(Debug, Default)]
pub struct TodoManager {
    /// Active lists by ID
    lists: HashMap<Uuid, TodoList>,

    /// Currently active list ID (if any)
    active_list_id: Option<Uuid>,
}

impl TodoManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Register a new TodoList
    pub fn register_list(&mut self, list: TodoList) -> Uuid {
        let id = list.id;
        self.lists.insert(id, list);
        // If no active list, make this one active
        if self.active_list_id.is_none() {
            self.active_list_id = Some(id);
        }
        id
    }

    /// Get the active list
    pub fn active_list(&self) -> Option<&TodoList> {
        self.active_list_id.and_then(|id| self.lists.get(&id))
    }

    /// Get mutable active list
    pub fn active_list_mut(&mut self) -> Option<&mut TodoList> {
        self.active_list_id.and_then(|id| self.lists.get_mut(&id))
    }

    /// Set the active list
    pub fn set_active_list(&mut self, id: Uuid) -> Result<(), TodoManagerError> {
        if self.lists.contains_key(&id) {
            self.active_list_id = Some(id);
            Ok(())
        } else {
            Err(TodoManagerError::ListNotFound(id))
        }
    }

    /// Get a specific list
    pub fn get_list(&self, id: Uuid) -> Option<&TodoList> {
        self.lists.get(&id)
    }

    /// Get mutable list
    pub fn get_list_mut(&mut self, id: Uuid) -> Option<&mut TodoList> {
        self.lists.get_mut(&id)
    }

    /// Mark an item as started
    pub fn mark_item_started(
        &mut self,
        list_id: Uuid,
        item_id: Uuid,
    ) -> Result<(), TodoManagerError> {
        let list = self
            .lists
            .get_mut(&list_id)
            .ok_or(TodoManagerError::ListNotFound(list_id))?;
        let item = list
            .get_item_mut(item_id)
            .ok_or(TodoManagerError::ItemNotFound(item_id))?;

        item.start();
        Ok(())
    }

    /// Mark an item as completed
    pub fn mark_item_completed(
        &mut self,
        list_id: Uuid,
        item_id: Uuid,
        result: Option<serde_json::Value>,
    ) -> Result<(), TodoManagerError> {
        let list = self
            .lists
            .get_mut(&list_id)
            .ok_or(TodoManagerError::ListNotFound(list_id))?;
        let item = list
            .get_item_mut(item_id)
            .ok_or(TodoManagerError::ItemNotFound(item_id))?;

        item.complete(result);

        // Check if list is complete
        if list.is_all_completed() {
            list.complete();
        }

        Ok(())
    }

    /// Mark an item as failed
    pub fn mark_item_failed(
        &mut self,
        list_id: Uuid,
        item_id: Uuid,
        error: String,
    ) -> Result<(), TodoManagerError> {
        let list = self
            .lists
            .get_mut(&list_id)
            .ok_or(TodoManagerError::ListNotFound(list_id))?;
        let item = list
            .get_item_mut(item_id)
            .ok_or(TodoManagerError::ItemNotFound(item_id))?;

        item.fail(error);
        Ok(())
    }

    /// Find the next pending item in the active list
    pub fn next_pending_in_active(&self) -> Option<&TodoItem> {
        self.active_list().and_then(|list| list.next_pending())
    }

    /// Check if active list is complete
    pub fn active_list_is_complete(&self) -> bool {
        self.active_list().map_or(false, |l| l.is_all_completed())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chat_core::todo::{TodoItemType, TodoStatus};

    #[test]
    fn test_manager_lifecycle() {
        let mut manager = TodoManager::new();
        let context_id = Uuid::new_v4();
        let mut list = TodoList::new("Test List", context_id);

        let item = TodoItem::new(
            TodoItemType::Chat {
                streaming_message_id: None,
            },
            "Test Item",
        );
        let item_id = item.id;
        list.add_item(item);

        let list_id = manager.register_list(list);

        assert_eq!(manager.active_list_id, Some(list_id));

        // Start item
        manager.mark_item_started(list_id, item_id).unwrap();
        let item = manager
            .get_list(list_id)
            .unwrap()
            .get_item(item_id)
            .unwrap();
        assert!(matches!(item.status, TodoStatus::InProgress));

        // Complete item
        manager.mark_item_completed(list_id, item_id, None).unwrap();
        let list = manager.get_list(list_id).unwrap();
        assert!(list.is_all_completed());
        assert!(matches!(
            list.status,
            chat_core::todo::TodoListStatus::Completed
        ));
    }
}
