use crate::error::Result;
use async_trait::async_trait;
use context_manager::structs::context::ChatContext;
use context_manager::structs::message::MessageNode;
use context_manager::structs::system_prompt_snapshot::SystemPromptSnapshot;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tokio::fs;
use tracing;
use uuid::Uuid;

use super::provider::StorageProvider;

/// Context-Local Message Pool storage provider
///
/// Storage structure:
/// ```text
/// base_dir/
///   contexts/
///     {context-id}/
///       context.json          # Context metadata (without message_pool)
///       messages_pool/
///         {message-id}.json   # Individual message files
///         ...
/// ```
pub struct MessagePoolStorageProvider {
    pub(crate) base_dir: PathBuf,
}

impl MessagePoolStorageProvider {
    pub fn new(base_dir: impl AsRef<Path>) -> Self {
        Self {
            base_dir: base_dir.as_ref().to_path_buf(),
        }
    }

    /// Get the context directory path
    fn get_context_dir(&self, id: Uuid) -> PathBuf {
        self.base_dir.join("contexts").join(id.to_string())
    }

    /// Get the context metadata file path
    fn get_context_metadata_path(&self, id: Uuid) -> PathBuf {
        self.get_context_dir(id).join("context.json")
    }

    /// Get the messages pool directory path
    fn get_messages_pool_dir(&self, id: Uuid) -> PathBuf {
        self.get_context_dir(id).join("messages_pool")
    }

    /// Get a specific message file path
    fn get_message_path(&self, context_id: Uuid, message_id: Uuid) -> PathBuf {
        self.get_messages_pool_dir(context_id)
            .join(format!("{}.json", message_id))
    }

    /// Load all messages from the message pool directory
    async fn load_messages(&self, context_id: Uuid) -> Result<HashMap<Uuid, MessageNode>> {
        let messages_dir = self.get_messages_pool_dir(context_id);
        let mut message_pool = HashMap::new();

        if !messages_dir.exists() {
            tracing::debug!(
                context_id = %context_id,
                "Messages pool directory does not exist"
            );
            return Ok(message_pool);
        }

        let mut entries = fs::read_dir(&messages_dir).await?;
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.is_file() && path.extension().map_or(false, |ext| ext == "json") {
                if let Some(stem) = path.file_stem() {
                    if let Some(stem_str) = stem.to_str() {
                        if let Ok(message_id) = Uuid::parse_str(stem_str) {
                            match fs::read_to_string(&path).await {
                                Ok(content) => {
                                    match serde_json::from_str::<MessageNode>(&content) {
                                        Ok(message) => {
                                            message_pool.insert(message_id, message);
                                        }
                                        Err(e) => {
                                            tracing::error!(
                                                context_id = %context_id,
                                                message_id = %message_id,
                                                error = %e,
                                                "Failed to deserialize message"
                                            );
                                        }
                                    }
                                }
                                Err(e) => {
                                    tracing::error!(
                                        context_id = %context_id,
                                        message_id = %message_id,
                                        error = %e,
                                        "Failed to read message file"
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }

        tracing::debug!(
            context_id = %context_id,
            message_count = message_pool.len(),
            "Loaded messages from pool"
        );

        Ok(message_pool)
    }

    /// Save all messages to the message pool directory
    async fn save_messages(
        &self,
        context_id: Uuid,
        message_pool: &HashMap<Uuid, MessageNode>,
    ) -> Result<()> {
        let messages_dir = self.get_messages_pool_dir(context_id);

        // Create messages_pool directory if it doesn't exist
        if !messages_dir.exists() {
            fs::create_dir_all(&messages_dir).await?;
            tracing::debug!(
                context_id = %context_id,
                path = %messages_dir.display(),
                "Created messages_pool directory"
            );
        }

        // Save each message as a separate file
        for (message_id, message_node) in message_pool {
            let message_path = self.get_message_path(context_id, *message_id);
            let content = serde_json::to_string_pretty(message_node)?;

            fs::write(&message_path, content).await?;

            tracing::trace!(
                context_id = %context_id,
                message_id = %message_id,
                "Saved message file"
            );
        }

        tracing::debug!(
            context_id = %context_id,
            message_count = message_pool.len(),
            "Saved all messages to pool"
        );

        Ok(())
    }
}

#[async_trait]
impl StorageProvider for MessagePoolStorageProvider {
    async fn load_context(&self, id: Uuid) -> Result<Option<ChatContext>> {
        let metadata_path = self.get_context_metadata_path(id);

        tracing::debug!(
            context_id = %id,
            path = %metadata_path.display(),
            "MessagePoolStorage: load_context called"
        );

        if !metadata_path.exists() {
            tracing::debug!(
                context_id = %id,
                "MessagePoolStorage: Context metadata file does not exist"
            );
            return Ok(None);
        }

        // Load context metadata
        let content = fs::read_to_string(&metadata_path).await?;
        let mut context: ChatContext = serde_json::from_str(&content)?;

        tracing::debug!(
            context_id = %id,
            "MessagePoolStorage: Loaded context metadata"
        );

        // Load messages from message pool
        let message_pool = self.load_messages(id).await?;
        context.message_pool = message_pool;

        tracing::info!(
            context_id = %id,
            message_count = context.message_pool.len(),
            branch_count = context.branches.len(),
            "MessagePoolStorage: Context loaded successfully"
        );

        Ok(Some(context))
    }

    async fn save_context(&self, context: &ChatContext) -> Result<()> {
        let context_dir = self.get_context_dir(context.id);
        let metadata_path = self.get_context_metadata_path(context.id);
        let trace_id = context.get_trace_id().map(|s| s.to_string());

        tracing::debug!(
            trace_id = ?trace_id,
            context_id = %context.id,
            "MessagePoolStorage: save_context called"
        );

        // Create context directory if it doesn't exist
        if !context_dir.exists() {
            fs::create_dir_all(&context_dir).await?;
            tracing::debug!(
                context_id = %context.id,
                path = %context_dir.display(),
                "MessagePoolStorage: Created context directory"
            );
        }

        // Save messages to message pool
        self.save_messages(context.id, &context.message_pool)
            .await?;

        // Prepare context metadata (without message_pool for smaller file)
        let mut metadata_context = context.clone();
        metadata_context.message_pool.clear();

        // Save context metadata
        let content = serde_json::to_string_pretty(&metadata_context)?;
        fs::write(&metadata_path, content).await?;

        tracing::info!(
            trace_id = ?trace_id,
            context_id = %context.id,
            message_count = context.message_pool.len(),
            "MessagePoolStorage: Context saved successfully"
        );

        Ok(())
    }

    async fn list_contexts(&self) -> Result<Vec<Uuid>> {
        let contexts_dir = self.base_dir.join("contexts");

        tracing::debug!(
            base_dir = %contexts_dir.display(),
            "MessagePoolStorage: Scanning directory for contexts"
        );

        let mut contexts = Vec::new();
        if !contexts_dir.exists() {
            tracing::debug!(
                base_dir = %contexts_dir.display(),
                "MessagePoolStorage: Contexts directory does not exist"
            );
            return Ok(contexts);
        }

        let mut entries = fs::read_dir(&contexts_dir).await?;
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.is_dir() {
                if let Some(name) = path.file_name() {
                    if let Some(name_str) = name.to_str() {
                        if let Ok(id) = Uuid::parse_str(name_str) {
                            // Verify context.json exists
                            let metadata_path = path.join("context.json");
                            if metadata_path.exists() {
                                contexts.push(id);
                            }
                        }
                    }
                }
            }
        }

        tracing::info!(
            base_dir = %contexts_dir.display(),
            context_count = contexts.len(),
            "MessagePoolStorage: Contexts found"
        );

        Ok(contexts)
    }

    async fn delete_context(&self, id: Uuid) -> Result<()> {
        let context_dir = self.get_context_dir(id);

        tracing::info!(
            context_id = %id,
            path = %context_dir.display(),
            "MessagePoolStorage: Deleting context directory"
        );

        if context_dir.exists() {
            fs::remove_dir_all(&context_dir).await?;
            tracing::info!(
                context_id = %id,
                path = %context_dir.display(),
                "MessagePoolStorage: Context directory deleted"
            );
        } else {
            tracing::debug!(
                context_id = %id,
                path = %context_dir.display(),
                "MessagePoolStorage: Directory did not exist"
            );
        }

        Ok(())
    }

    async fn save_system_prompt_snapshot(
        &self,
        context_id: Uuid,
        snapshot: &SystemPromptSnapshot,
    ) -> Result<()> {
        let context_dir = self.get_context_dir(context_id);
        let snapshot_path = context_dir.join("system_prompt.json");

        // Ensure context directory exists
        if !context_dir.exists() {
            fs::create_dir_all(&context_dir).await?;
        }

        // Serialize and write snapshot
        let json = serde_json::to_string_pretty(snapshot)?;
        fs::write(&snapshot_path, json).await?;

        tracing::debug!(
            context_id = %context_id,
            version = snapshot.version,
            tool_count = snapshot.stats.tool_count,
            prompt_length = snapshot.stats.total_length,
            "MessagePoolStorage: Saved system prompt snapshot"
        );

        Ok(())
    }

    async fn load_system_prompt_snapshot(
        &self,
        context_id: Uuid,
    ) -> Result<Option<SystemPromptSnapshot>> {
        let context_dir = self.get_context_dir(context_id);
        let snapshot_path = context_dir.join("system_prompt.json");

        if !snapshot_path.exists() {
            tracing::debug!(
                context_id = %context_id,
                "MessagePoolStorage: System prompt snapshot does not exist"
            );
            return Ok(None);
        }

        let json = fs::read_to_string(&snapshot_path).await?;
        let snapshot: SystemPromptSnapshot = serde_json::from_str(&json)?;

        tracing::debug!(
            context_id = %context_id,
            version = snapshot.version,
            "MessagePoolStorage: Loaded system prompt snapshot"
        );

        Ok(Some(snapshot))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_save_and_load_context() {
        let temp_dir = TempDir::new().unwrap();
        let provider = MessagePoolStorageProvider::new(temp_dir.path());

        // Create a test context
        let context_id = Uuid::new_v4();
        let mut context =
            ChatContext::new(context_id, "test-model".to_string(), "code".to_string());

        // Add a test message
        use context_manager::structs::message::{InternalMessage, Role};
        let message = InternalMessage {
            role: Role::User,
            content: vec![],
            tool_calls: None,
            tool_result: None,
            message_type: context_manager::MessageType::Text,
            metadata: Default::default(),
            rich_type: None,
        };
        let message_id = context.add_message_to_branch("main", message);

        // Save context
        provider.save_context(&context).await.unwrap();

        // Verify directory structure
        let context_dir = provider.get_context_dir(context.id);
        assert!(context_dir.exists());
        assert!(provider.get_context_metadata_path(context.id).exists());
        assert!(provider.get_messages_pool_dir(context.id).exists());
        assert!(provider.get_message_path(context.id, message_id).exists());

        // Load context
        let loaded = provider.load_context(context.id).await.unwrap().unwrap();
        assert_eq!(loaded.id, context.id);
        assert_eq!(loaded.message_pool.len(), 1);
        assert!(loaded.message_pool.contains_key(&message_id));
    }

    #[tokio::test]
    async fn test_list_contexts() {
        let temp_dir = TempDir::new().unwrap();
        let provider = MessagePoolStorageProvider::new(temp_dir.path());

        // Create multiple contexts
        let context1 =
            ChatContext::new(Uuid::new_v4(), "test-model".to_string(), "code".to_string());
        let context2 =
            ChatContext::new(Uuid::new_v4(), "test-model".to_string(), "code".to_string());

        provider.save_context(&context1).await.unwrap();
        provider.save_context(&context2).await.unwrap();

        // List contexts
        let contexts = provider.list_contexts().await.unwrap();
        assert_eq!(contexts.len(), 2);
        assert!(contexts.contains(&context1.id));
        assert!(contexts.contains(&context2.id));
    }

    #[tokio::test]
    async fn test_delete_context() {
        let temp_dir = TempDir::new().unwrap();
        let provider = MessagePoolStorageProvider::new(temp_dir.path());

        let context =
            ChatContext::new(Uuid::new_v4(), "test-model".to_string(), "code".to_string());

        // Save and verify
        provider.save_context(&context).await.unwrap();
        assert!(provider.get_context_dir(context.id).exists());

        // Delete and verify
        provider.delete_context(context.id).await.unwrap();
        assert!(!provider.get_context_dir(context.id).exists());
    }

    #[tokio::test]
    async fn test_save_and_load_system_prompt_snapshot() {
        use context_manager::structs::context_agent::AgentRole;
        use context_manager::structs::system_prompt_snapshot::{
            PromptSource, SystemPromptSnapshot,
        };

        let temp_dir = TempDir::new().unwrap();
        let provider = MessagePoolStorageProvider::new(temp_dir.path());

        let context_id = Uuid::new_v4();
        let snapshot = SystemPromptSnapshot::new(
            1,
            context_id,
            AgentRole::Actor,
            PromptSource::Default,
            "You are a helpful AI assistant with access to tools.".to_string(),
            vec![
                "read_file".to_string(),
                "write_file".to_string(),
                "list_directory".to_string(),
            ],
        );

        // Save snapshot
        provider
            .save_system_prompt_snapshot(context_id, &snapshot)
            .await
            .unwrap();

        // Verify file exists
        let snapshot_path = provider
            .get_context_dir(context_id)
            .join("system_prompt.json");
        assert!(snapshot_path.exists());

        // Load snapshot
        let loaded = provider
            .load_system_prompt_snapshot(context_id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(loaded.version, 1);
        assert_eq!(loaded.context_id, context_id);
        assert_eq!(loaded.stats.tool_count, 3);
        assert_eq!(loaded.available_tools.len(), 3);
        assert!(loaded.enhanced_prompt.contains("helpful AI assistant"));
    }

    #[tokio::test]
    async fn test_load_nonexistent_snapshot() {
        let temp_dir = TempDir::new().unwrap();
        let provider = MessagePoolStorageProvider::new(temp_dir.path());

        let context_id = Uuid::new_v4();
        let result = provider
            .load_system_prompt_snapshot(context_id)
            .await
            .unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_snapshot_with_different_sources() {
        use context_manager::structs::context_agent::AgentRole;
        use context_manager::structs::system_prompt_snapshot::{
            PromptSource, SystemPromptSnapshot,
        };

        let temp_dir = TempDir::new().unwrap();
        let provider = MessagePoolStorageProvider::new(temp_dir.path());

        // Test with Service source
        let context_id1 = Uuid::new_v4();
        let snapshot1 = SystemPromptSnapshot::new(
            1,
            context_id1,
            AgentRole::Planner,
            PromptSource::Service {
                prompt_id: "default".to_string(),
            },
            "Test prompt from service".to_string(),
            vec!["read_file".to_string()],
        );
        provider
            .save_system_prompt_snapshot(context_id1, &snapshot1)
            .await
            .unwrap();

        // Test with Branch source
        let context_id2 = Uuid::new_v4();
        let snapshot2 = SystemPromptSnapshot::new(
            2,
            context_id2,
            AgentRole::Actor,
            PromptSource::Branch {
                branch_name: "feature-branch".to_string(),
            },
            "Test prompt from branch".to_string(),
            vec!["write_file".to_string()],
        );
        provider
            .save_system_prompt_snapshot(context_id2, &snapshot2)
            .await
            .unwrap();

        // Verify both can be loaded
        let loaded1 = provider
            .load_system_prompt_snapshot(context_id1)
            .await
            .unwrap()
            .unwrap();
        let loaded2 = provider
            .load_system_prompt_snapshot(context_id2)
            .await
            .unwrap()
            .unwrap();

        assert_eq!(loaded1.version, 1);
        assert_eq!(loaded2.version, 2);
    }
}
