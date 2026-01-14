use crate::{
    error::AppError,
    models::ClientMessageMetadata,
    services::{
        message_builder, session_manager::ChatSessionManager,
    },
    storage::StorageProvider,
};
use context_manager::{structs::tool::DisplayPreference, ChatContext, ContextUpdate};
use serde_json::json;
use std::sync::Arc;
use tokio::sync::RwLock;
use tool_system::ToolExecutor;

/// Handles file reference processing
///
/// This handler is responsible for:
/// - Processing file and directory references
/// - Executing file operations via ToolExecutor
/// - Managing display preferences for file content
pub struct FileReferenceHandler<T: StorageProvider> {
    tool_executor: Arc<ToolExecutor>,
    session_manager: Arc<ChatSessionManager<T>>,
}

impl<T: StorageProvider> FileReferenceHandler<T> {
    pub fn new(
        tool_executor: Arc<ToolExecutor>,
        session_manager: Arc<ChatSessionManager<T>>,
    ) -> Self {
        Self {
            tool_executor,
            session_manager,
        }
    }

    /// Execute file reference: read files or list directories
    /// Returns Ok(()) to allow AI call to proceed
    pub async fn handle(
        &self,
        context: &Arc<RwLock<ChatContext>>,
        paths: &[String],
        display_text: &str,
        metadata: &ClientMessageMetadata,
    ) -> Result<(), AppError> {
        // 1. Add user message
        let incoming = message_builder::build_incoming_text_message(
            display_text,
            Some(display_text),
            metadata,
        );

        let stream = {
            let mut ctx = context.write().await;
            ctx.send_message(incoming)
                .map_err(|err| AppError::InternalError(anyhow::anyhow!(err.to_string())))?
        };

        // Collect updates
        use futures_util::StreamExt;
        let _updates = stream.collect::<Vec<ContextUpdate>>().await;

        self.session_manager.auto_save_if_dirty(context).await?;

        // 2. Process each path using inline tool execution
        for path in paths {
            let path_obj = std::path::Path::new(path);

            let (tool_name, arguments) = if path_obj.is_dir() {
                // Directory: use list_directory tool with depth=1
                let mut args = serde_json::Map::new();
                args.insert("path".to_string(), json!(path));
                args.insert("depth".to_string(), json!(1));
                ("list_directory", args)
            } else {
                // File: use read_file tool
                let mut args = serde_json::Map::new();
                args.insert("path".to_string(), json!(path));
                ("read_file", args)
            };

            // Execute tool with inline pattern
            {
                let mut ctx = context.write().await;
                let depth = ctx.tool_execution.auto_loop_depth() + 1;
                ctx.begin_auto_loop(depth);
                ctx.begin_tool_execution(tool_name, 1, None);
            }

            let result = self
                .tool_executor
                .execute_tool(
                    tool_name,
                    tool_system::types::ToolArguments::Json(serde_json::Value::Object(arguments)),
                )
                .await
                .map_err(|e| AppError::ToolExecutionError(e.to_string()))?;

            // Record success and create tool result message
            {
                let mut ctx = context.write().await;
                ctx.record_auto_loop_progress();
                ctx.complete_tool_execution();
                ctx.complete_auto_loop();

                // Create tool result message with Hidden display preference
                let message_text = result.to_string();
                use context_manager::{ContentPart, InternalMessage, MessageType, Role};
                let tool_message = InternalMessage {
                    role: Role::Tool,
                    content: vec![ContentPart::text_owned(message_text)],
                    tool_result: Some(context_manager::structs::tool::ToolCallResult {
                        request_id: tool_name.to_string(),
                        result: result.clone(),
                        display_preference: DisplayPreference::Hidden,
                    }),
                    message_type: MessageType::ToolResult,
                    ..Default::default()
                };
                
                ctx.add_message_to_branch("main", tool_message);
            }

            self.session_manager.auto_save_if_dirty(context).await?;
        }

        // ✅ Return Ok(()) to allow AI call to proceed
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::session_manager::ChatSessionManager;
    use crate::storage::StorageProvider;
    use async_trait::async_trait;
    use context_manager::structs::system_prompt_snapshot::SystemPromptSnapshot;
    use context_manager::structs::tool::DisplayPreference;
    use context_manager::{ChatContext, MessageType, Role};
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};
    use tempfile::TempDir;
    use tool_system::extensions::file_operations::{ListDirectoryTool, ReadFileTool};
    use tool_system::registry::{ToolFactory, ToolRegistry};
    use tool_system::ToolExecutor;
    use uuid::Uuid;

    #[derive(Default)]
    struct MemoryStorageProvider {
        contexts: Mutex<HashMap<Uuid, ChatContext>>,
        snapshots: Mutex<HashMap<Uuid, SystemPromptSnapshot>>,
    }

    #[async_trait]
    impl StorageProvider for MemoryStorageProvider {
        async fn load_context(&self, id: Uuid) -> crate::error::Result<Option<ChatContext>> {
            Ok(self.contexts.lock().unwrap().get(&id).cloned())
        }

        async fn save_context(&self, context: &ChatContext) -> crate::error::Result<()> {
            self.contexts
                .lock()
                .unwrap()
                .insert(context.id, context.clone());
            Ok(())
        }

        async fn list_contexts(&self) -> crate::error::Result<Vec<Uuid>> {
            Ok(self.contexts.lock().unwrap().keys().cloned().collect())
        }

        async fn delete_context(&self, id: Uuid) -> crate::error::Result<()> {
            self.contexts.lock().unwrap().remove(&id);
            Ok(())
        }

        async fn save_system_prompt_snapshot(
            &self,
            context_id: Uuid,
            snapshot: &SystemPromptSnapshot,
        ) -> crate::error::Result<()> {
            self.snapshots
                .lock()
                .unwrap()
                .insert(context_id, snapshot.clone());
            Ok(())
        }

        async fn load_system_prompt_snapshot(
            &self,
            context_id: Uuid,
        ) -> crate::error::Result<Option<SystemPromptSnapshot>> {
            Ok(self.snapshots.lock().unwrap().get(&context_id).cloned())
        }
    }

    struct TestEnv {
        handler: FileReferenceHandler<MemoryStorageProvider>,
        context: Arc<RwLock<ChatContext>>,
        _temp_dir: TempDir,
    }

    async fn setup_test_env() -> TestEnv {
        let storage = Arc::new(MemoryStorageProvider::default());
        let tool_registry = Arc::new(Mutex::new(
            tool_system::registry::registration::create_default_tool_registry(),
        ));
        let session_manager = Arc::new(ChatSessionManager::new(
            storage.clone(),
            8,
            tool_registry.clone(),
        ));

        let registry = ToolRegistry::new();
        registry.register_factory(Arc::new(ReadFileTool::new()));
        registry.register_factory(Arc::new(ListDirectoryTool::new()));
        let tool_executor = Arc::new(ToolExecutor::new(Arc::new(Mutex::new(registry))));

        let handler = FileReferenceHandler::new(tool_executor, session_manager.clone());

        let conversation_context = session_manager
            .create_session("gpt-test".into(), "chat".into(), None)
            .await
            .expect("create session");

        let temp_dir = TempDir::new().unwrap();

        TestEnv {
            handler,
            context: conversation_context,
            _temp_dir: temp_dir,
        }
    }

    /// Test file reference with single file
    #[tokio::test]
    async fn test_file_reference_single_file() {
        let TestEnv {
            handler,
            context,
            _temp_dir,
        } = setup_test_env().await;

        // Create a test file
        let test_file = _temp_dir.path().join("test.txt");
        std::fs::write(&test_file, "Hello, World!").unwrap();

        // Execute file reference
        handler
            .handle(
                &context,
                &[test_file.to_str().unwrap().to_string()],
                "@test.txt what's the content?",
                &ClientMessageMetadata::default(),
            )
            .await
            .expect("file reference executed");

        // Verify context state
        let context_guard = context.read().await;
        let branch = context_guard
            .get_active_branch()
            .expect("active branch available");

        // Should have: user message + tool result message
        assert_eq!(branch.message_ids.len(), 2);

        // Check user message
        let user_message_id = branch.message_ids[0];
        let user_node = context_guard
            .message_pool
            .get(&user_message_id)
            .expect("user message present");
        assert_eq!(user_node.message.role, Role::User);

        // Check tool result message
        let tool_message_id = branch.message_ids[1];
        let tool_node = context_guard
            .message_pool
            .get(&tool_message_id)
            .expect("tool message present");
        assert_eq!(tool_node.message.role, Role::Tool);
        assert_eq!(tool_node.message.message_type, MessageType::ToolResult);

        // Verify tool result has display_preference: Hidden
        let tool_result = tool_node
            .message
            .tool_result
            .as_ref()
            .expect("tool result present");
        assert_eq!(tool_result.display_preference, DisplayPreference::Hidden);
    }

    /// Test file reference with multiple files
    #[tokio::test]
    async fn test_file_reference_multiple_files() {
        let TestEnv {
            handler,
            context,
            _temp_dir,
        } = setup_test_env().await;

        // Create test files
        let test_file1 = _temp_dir.path().join("file1.txt");
        let test_file2 = _temp_dir.path().join("file2.txt");
        std::fs::write(&test_file1, "Content 1").unwrap();
        std::fs::write(&test_file2, "Content 2").unwrap();

        let paths = vec![
            test_file1.to_str().unwrap().to_string(),
            test_file2.to_str().unwrap().to_string(),
        ];

        // Execute file reference
        handler
            .handle(
                &context,
                &paths,
                "@file1.txt @file2.txt compare these",
                &ClientMessageMetadata::default(),
            )
            .await
            .expect("file reference executed");

        // Verify context state
        let context_guard = context.read().await;
        let branch = context_guard
            .get_active_branch()
            .expect("active branch available");

        // Should have: user message + 2 tool result messages
        assert_eq!(branch.message_ids.len(), 3);

        // Check both tool results have display_preference: Hidden
        for i in 1..=2 {
            let tool_message_id = branch.message_ids[i];
            let tool_node = context_guard
                .message_pool
                .get(&tool_message_id)
                .expect("tool message present");
            assert_eq!(tool_node.message.role, Role::Tool);

            let tool_result = tool_node
                .message
                .tool_result
                .as_ref()
                .expect("tool result present");
            assert_eq!(tool_result.display_preference, DisplayPreference::Hidden);
        }
    }

    /// Test file reference with directory
    #[tokio::test]
    async fn test_file_reference_directory() {
        let TestEnv {
            handler,
            context,
            _temp_dir,
        } = setup_test_env().await;

        // Create a test directory with files
        let test_dir = _temp_dir.path().join("test_folder");
        std::fs::create_dir(&test_dir).unwrap();
        std::fs::write(test_dir.join("file1.txt"), "File 1").unwrap();
        std::fs::write(test_dir.join("file2.txt"), "File 2").unwrap();

        let paths = vec![test_dir.to_str().unwrap().to_string()];

        // Execute file reference
        handler
            .handle(
                &context,
                &paths,
                "@test_folder/ what files are here?",
                &ClientMessageMetadata::default(),
            )
            .await
            .expect("file reference executed");

        // Verify context state
        let context_guard = context.read().await;
        let branch = context_guard
            .get_active_branch()
            .expect("active branch available");

        // Should have: user message + tool result message (list_directory output)
        assert_eq!(branch.message_ids.len(), 2);

        let tool_message_id = branch.message_ids[1];
        let tool_node = context_guard
            .message_pool
            .get(&tool_message_id)
            .expect("tool message present");
        assert_eq!(tool_node.message.role, Role::Tool);
        assert_eq!(tool_node.message.message_type, MessageType::ToolResult);

        let tool_result = tool_node
            .message
            .tool_result
            .as_ref()
            .expect("tool result present");
        assert_eq!(tool_result.display_preference, DisplayPreference::Hidden);
    }

    /// Test file reference with mixed files and directories
    #[tokio::test]
    async fn test_file_reference_mixed() {
        let TestEnv {
            handler,
            context,
            _temp_dir,
        } = setup_test_env().await;

        // Create test file and directory
        let test_file = _temp_dir.path().join("readme.txt");
        let test_dir = _temp_dir.path().join("src");
        std::fs::write(&test_file, "README content").unwrap();
        std::fs::create_dir(&test_dir).unwrap();
        std::fs::write(test_dir.join("main.rs"), "fn main() {}").unwrap();

        let paths = vec![
            test_file.to_str().unwrap().to_string(),
            test_dir.to_str().unwrap().to_string(),
        ];

        // Execute file reference
        handler
            .handle(
                &context,
                &paths,
                "@readme.txt @src/ analyze the project",
                &ClientMessageMetadata::default(),
            )
            .await
            .expect("file reference executed");

        // Verify context state
        let context_guard = context.read().await;
        let branch = context_guard
            .get_active_branch()
            .expect("active branch available");

        // Should have: user message + 2 tool result messages (read_file + list_directory)
        assert_eq!(branch.message_ids.len(), 3);

        // Check both tool results have display_preference: Hidden
        for i in 1..=2 {
            let tool_message_id = branch.message_ids[i];
            let tool_node = context_guard
                .message_pool
                .get(&tool_message_id)
                .expect("tool message present");
            assert_eq!(tool_node.message.role, Role::Tool);

            let tool_result = tool_node
                .message
                .tool_result
                .as_ref()
                .expect("tool result present");
            assert_eq!(tool_result.display_preference, DisplayPreference::Hidden);
        }
    }
}
