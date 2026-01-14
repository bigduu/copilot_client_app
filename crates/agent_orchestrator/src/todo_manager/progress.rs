//! Progress tracking
//!
//! Helper functions for calculating and formatting progress.

use chat_core::todo::TodoList;

pub fn calculate_overall_progress(lists: &[TodoList]) -> f64 {
    if lists.is_empty() {
        return 0.0;
    }
    
    let total_progress: f64 = lists.iter().map(|l| l.progress()).sum();
    total_progress / lists.len() as f64
}

pub fn format_progress_bar(percentage: f64, width: usize) -> String {
    let filled = (percentage * width as f64).round() as usize;
    let empty = width.saturating_sub(filled);
    
    let filled_str = "█".repeat(filled);
    let empty_str = "░".repeat(empty);
    
    format!("{}{}", filled_str, empty_str)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chat_core::todo::{TodoItem, TodoItemType};
    use uuid::Uuid;
    
    #[test]
    fn test_progress_calculation() {
        let mut list = TodoList::new("Test", Uuid::new_v4());
        let mut item = TodoItem::new(TodoItemType::Chat{streaming_message_id:None}, "Task");
        item.complete(None);
        list.add_item(item);
        list.add_item(TodoItem::new(TodoItemType::Chat{streaming_message_id:None}, "Task 2"));
        
        assert_eq!(list.progress(), 0.5);
        assert_eq!(calculate_overall_progress(&[list]), 0.5);
    }
}
