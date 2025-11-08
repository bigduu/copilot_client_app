use crate::error::Result;
use context_manager::structs::message::Role;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tokio::fs;
use uuid::Uuid;

/// Message index for efficient message querying and lazy loading.
///
/// The index stores lightweight metadata about messages without loading
/// the full content, enabling:
/// - Fast message existence checks
/// - Efficient filtering by role, timestamp, or other criteria
/// - Lazy loading of message content only when needed
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageIndex {
    /// Map of message ID to message metadata
    pub entries: HashMap<Uuid, MessageIndexEntry>,
    
    /// Index version for migration compatibility
    pub version: u32,
    
    /// Last updated timestamp
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

/// Lightweight metadata for a single message
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageIndexEntry {
    pub message_id: Uuid,
    pub role: Role,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub size_bytes: u64,
    pub has_tool_calls: bool,
    pub has_tool_result: bool,
    pub message_type: String,
}

impl MessageIndex {
    /// Create a new empty index
    pub fn new() -> Self {
        Self {
            entries: HashMap::new(),
            version: 1,
            updated_at: chrono::Utc::now(),
        }
    }

    /// Add or update an entry in the index
    pub fn insert(&mut self, entry: MessageIndexEntry) {
        self.entries.insert(entry.message_id, entry);
        self.updated_at = chrono::Utc::now();
    }

    /// Remove an entry from the index
    pub fn remove(&mut self, message_id: &Uuid) -> Option<MessageIndexEntry> {
        let result = self.entries.remove(message_id);
        if result.is_some() {
            self.updated_at = chrono::Utc::now();
        }
        result
    }

    /// Get an entry by message ID
    pub fn get(&self, message_id: &Uuid) -> Option<&MessageIndexEntry> {
        self.entries.get(message_id)
    }

    /// Check if a message exists in the index
    pub fn contains(&self, message_id: &Uuid) -> bool {
        self.entries.contains_key(message_id)
    }

    /// Get the number of messages in the index
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Check if the index is empty
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Filter entries by role
    pub fn filter_by_role(&self, role: &Role) -> Vec<&MessageIndexEntry> {
        self.entries
            .values()
            .filter(|entry| &entry.role == role)
            .collect()
    }

    /// Get entries sorted by timestamp
    pub fn sorted_by_timestamp(&self) -> Vec<&MessageIndexEntry> {
        let mut entries: Vec<&MessageIndexEntry> = self.entries.values().collect();
        entries.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));
        entries
    }

    /// Load index from file
    pub async fn load_from_file(path: impl AsRef<Path>) -> Result<Self> {
        let content = fs::read_to_string(path).await?;
        let index: MessageIndex = serde_json::from_str(&content)?;
        Ok(index)
    }

    /// Save index to file
    pub async fn save_to_file(&self, path: impl AsRef<Path>) -> Result<()> {
        let content = serde_json::to_string_pretty(self)?;
        fs::write(path, content).await?;
        Ok(())
    }
}

impl Default for MessageIndex {
    fn default() -> Self {
        Self::new()
    }
}

/// Builder for creating message index entries
pub struct MessageIndexEntryBuilder {
    message_id: Uuid,
    role: Role,
    timestamp: Option<chrono::DateTime<chrono::Utc>>,
    size_bytes: Option<u64>,
    has_tool_calls: bool,
    has_tool_result: bool,
    message_type: Option<String>,
}

impl MessageIndexEntryBuilder {
    pub fn new(message_id: Uuid, role: Role) -> Self {
        Self {
            message_id,
            role,
            timestamp: None,
            size_bytes: None,
            has_tool_calls: false,
            has_tool_result: false,
            message_type: None,
        }
    }

    pub fn timestamp(mut self, timestamp: chrono::DateTime<chrono::Utc>) -> Self {
        self.timestamp = Some(timestamp);
        self
    }

    pub fn size_bytes(mut self, size_bytes: u64) -> Self {
        self.size_bytes = Some(size_bytes);
        self
    }

    pub fn has_tool_calls(mut self, has_tool_calls: bool) -> Self {
        self.has_tool_calls = has_tool_calls;
        self
    }

    pub fn has_tool_result(mut self, has_tool_result: bool) -> Self {
        self.has_tool_result = has_tool_result;
        self
    }

    pub fn message_type(mut self, message_type: String) -> Self {
        self.message_type = Some(message_type);
        self
    }

    pub fn build(self) -> MessageIndexEntry {
        MessageIndexEntry {
            message_id: self.message_id,
            role: self.role,
            timestamp: self.timestamp.unwrap_or_else(chrono::Utc::now),
            size_bytes: self.size_bytes.unwrap_or(0),
            has_tool_calls: self.has_tool_calls,
            has_tool_result: self.has_tool_result,
            message_type: self.message_type.unwrap_or_else(|| "text".to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_message_index_basic_operations() {
        let mut index = MessageIndex::new();
        assert!(index.is_empty());

        let message_id = Uuid::new_v4();
        let entry = MessageIndexEntryBuilder::new(message_id, Role::User)
            .size_bytes(100)
            .message_type("text".to_string())
            .build();

        index.insert(entry.clone());
        assert_eq!(index.len(), 1);
        assert!(index.contains(&message_id));

        let retrieved = index.get(&message_id).unwrap();
        assert_eq!(retrieved.message_id, message_id);
        assert_eq!(retrieved.size_bytes, 100);

        index.remove(&message_id);
        assert!(index.is_empty());
    }

    #[test]
    fn test_filter_by_role() {
        let mut index = MessageIndex::new();

        let user_id = Uuid::new_v4();
        let assistant_id = Uuid::new_v4();

        index.insert(
            MessageIndexEntryBuilder::new(user_id, Role::User).build()
        );
        index.insert(
            MessageIndexEntryBuilder::new(assistant_id, Role::Assistant).build()
        );

        let user_entries = index.filter_by_role(&Role::User);
        assert_eq!(user_entries.len(), 1);
        assert_eq!(user_entries[0].message_id, user_id);

        let assistant_entries = index.filter_by_role(&Role::Assistant);
        assert_eq!(assistant_entries.len(), 1);
        assert_eq!(assistant_entries[0].message_id, assistant_id);
    }

    #[test]
    fn test_sorted_by_timestamp() {
        let mut index = MessageIndex::new();

        let now = chrono::Utc::now();
        let past = now - chrono::Duration::hours(1);
        let future = now + chrono::Duration::hours(1);

        let id1 = Uuid::new_v4();
        let id2 = Uuid::new_v4();
        let id3 = Uuid::new_v4();

        index.insert(
            MessageIndexEntryBuilder::new(id1, Role::User)
                .timestamp(now)
                .build()
        );
        index.insert(
            MessageIndexEntryBuilder::new(id2, Role::User)
                .timestamp(past)
                .build()
        );
        index.insert(
            MessageIndexEntryBuilder::new(id3, Role::User)
                .timestamp(future)
                .build()
        );

        let sorted = index.sorted_by_timestamp();
        assert_eq!(sorted.len(), 3);
        assert_eq!(sorted[0].message_id, id2); // past
        assert_eq!(sorted[1].message_id, id1); // now
        assert_eq!(sorted[2].message_id, id3); // future
    }

    #[tokio::test]
    async fn test_save_and_load() {
        let temp_dir = TempDir::new().unwrap();
        let index_path = temp_dir.path().join("index.json");

        let mut index = MessageIndex::new();
        let message_id = Uuid::new_v4();
        index.insert(
            MessageIndexEntryBuilder::new(message_id, Role::User)
                .size_bytes(200)
                .has_tool_calls(true)
                .build()
        );

        // Save
        index.save_to_file(&index_path).await.unwrap();
        assert!(index_path.exists());

        // Load
        let loaded_index = MessageIndex::load_from_file(&index_path).await.unwrap();
        assert_eq!(loaded_index.len(), 1);
        assert!(loaded_index.contains(&message_id));

        let entry = loaded_index.get(&message_id).unwrap();
        assert_eq!(entry.size_bytes, 200);
        assert_eq!(entry.has_tool_calls, true);
    }
}

