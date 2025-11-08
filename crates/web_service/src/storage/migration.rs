use crate::error::Result;
use crate::storage::provider::StorageProvider;
use context_manager::structs::context::ChatContext;
use std::path::{Path, PathBuf};
use tokio::fs;
use tracing::{error, info, warn};
use uuid::Uuid;

/// Data migration tool for transitioning from legacy storage format to the new
/// Context-Local Message Pool storage architecture.
///
/// # Legacy Format
/// ```text
/// conversations/
///   {context-id}.json  # Single file with entire ChatContext including message_pool
/// ```
///
/// # New Format
/// ```text
/// contexts/
///   {context-id}/
///     context.json          # Metadata only (message_pool cleared)
///     messages_pool/
///       {message-id}.json   # Individual message files
/// ```
pub struct StorageMigration {
    legacy_dir: PathBuf,
    backup_dir: PathBuf,
}

impl StorageMigration {
    /// Create a new migration instance
    ///
    /// # Arguments
    /// * `legacy_dir` - Path to legacy conversations directory
    /// * `backup_dir` - Path where backups will be stored
    pub fn new(legacy_dir: impl AsRef<Path>, backup_dir: impl AsRef<Path>) -> Self {
        Self {
            legacy_dir: legacy_dir.as_ref().to_path_buf(),
            backup_dir: backup_dir.as_ref().to_path_buf(),
        }
    }

    /// Detect legacy format data files
    ///
    /// Scans the legacy directory for JSON files that match the UUID naming pattern.
    pub async fn detect_legacy_data(&self) -> Result<Vec<Uuid>> {
        let mut context_ids = Vec::new();

        if !self.legacy_dir.exists() {
            info!(
                legacy_dir = %self.legacy_dir.display(),
                "Legacy directory does not exist, no migration needed"
            );
            return Ok(context_ids);
        }

        let mut entries = fs::read_dir(&self.legacy_dir).await?;
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.is_file() && path.extension().map_or(false, |ext| ext == "json") {
                if let Some(stem) = path.file_stem() {
                    if let Some(stem_str) = stem.to_str() {
                        if let Ok(id) = Uuid::parse_str(stem_str) {
                            context_ids.push(id);
                        }
                    }
                }
            }
        }

        info!(
            legacy_dir = %self.legacy_dir.display(),
            context_count = context_ids.len(),
            "Detected legacy format contexts"
        );

        Ok(context_ids)
    }

    /// Backup a legacy context file
    ///
    /// Creates a timestamped backup of the original file before migration.
    async fn backup_context(&self, context_id: Uuid) -> Result<PathBuf> {
        let legacy_path = self.legacy_dir.join(format!("{}.json", context_id));
        
        // Create backup directory if it doesn't exist
        if !self.backup_dir.exists() {
            fs::create_dir_all(&self.backup_dir).await?;
            info!(
                backup_dir = %self.backup_dir.display(),
                "Created backup directory"
            );
        }

        // Generate timestamped backup filename
        let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
        let backup_filename = format!("{}_{}.json", context_id, timestamp);
        let backup_path = self.backup_dir.join(backup_filename);

        // Copy file to backup
        fs::copy(&legacy_path, &backup_path).await?;

        info!(
            context_id = %context_id,
            backup_path = %backup_path.display(),
            "Created backup of legacy context"
        );

        Ok(backup_path)
    }

    /// Load a legacy context from the old format
    async fn load_legacy_context(&self, context_id: Uuid) -> Result<ChatContext> {
        let legacy_path = self.legacy_dir.join(format!("{}.json", context_id));
        
        let content = fs::read_to_string(&legacy_path).await?;
        let context: ChatContext = serde_json::from_str(&content)?;

        info!(
            context_id = %context_id,
            message_count = context.message_pool.len(),
            branch_count = context.branches.len(),
            "Loaded legacy context"
        );

        Ok(context)
    }

    /// Migrate a single context from legacy to new format
    ///
    /// # Steps
    /// 1. Backup the original file
    /// 2. Load the legacy context
    /// 3. Save to new storage provider
    /// 4. Validate migration
    /// 5. (Optional) Delete legacy file
    pub async fn migrate_context<T: StorageProvider>(
        &self,
        context_id: Uuid,
        storage: &T,
        delete_legacy: bool,
    ) -> Result<MigrationResult> {
        info!(
            context_id = %context_id,
            "Starting migration for context"
        );

        let mut result = MigrationResult {
            context_id,
            success: false,
            backup_path: None,
            message_count: 0,
            error: None,
        };

        // Step 1: Backup
        match self.backup_context(context_id).await {
            Ok(backup_path) => {
                result.backup_path = Some(backup_path);
            }
            Err(e) => {
                error!(
                    context_id = %context_id,
                    error = %e,
                    "Failed to backup context"
                );
                result.error = Some(format!("Backup failed: {}", e));
                return Ok(result);
            }
        }

        // Step 2: Load legacy context
        let context = match self.load_legacy_context(context_id).await {
            Ok(ctx) => ctx,
            Err(e) => {
                error!(
                    context_id = %context_id,
                    error = %e,
                    "Failed to load legacy context"
                );
                result.error = Some(format!("Load failed: {}", e));
                return Ok(result);
            }
        };

        result.message_count = context.message_pool.len();

        // Step 3: Save to new format
        if let Err(e) = storage.save_context(&context).await {
            error!(
                context_id = %context_id,
                error = %e,
                "Failed to save context to new storage"
            );
            result.error = Some(format!("Save failed: {}", e));
            return Ok(result);
        }

        // Step 4: Validate migration
        match self.validate_migration(context_id, &context, storage).await {
            Ok(true) => {
                result.success = true;
                info!(
                    context_id = %context_id,
                    message_count = result.message_count,
                    "Migration successful"
                );
            }
            Ok(false) => {
                error!(
                    context_id = %context_id,
                    "Migration validation failed"
                );
                result.error = Some("Validation failed".to_string());
                return Ok(result);
            }
            Err(e) => {
                error!(
                    context_id = %context_id,
                    error = %e,
                    "Validation error"
                );
                result.error = Some(format!("Validation error: {}", e));
                return Ok(result);
            }
        }

        // Step 5: Optionally delete legacy file
        if delete_legacy {
            let legacy_path = self.legacy_dir.join(format!("{}.json", context_id));
            if let Err(e) = fs::remove_file(&legacy_path).await {
                warn!(
                    context_id = %context_id,
                    error = %e,
                    "Failed to delete legacy file (not critical)"
                );
            } else {
                info!(
                    context_id = %context_id,
                    legacy_path = %legacy_path.display(),
                    "Deleted legacy file"
                );
            }
        }

        Ok(result)
    }

    /// Validate that the migration was successful
    ///
    /// Loads the context from the new storage and compares it with the original.
    async fn validate_migration<T: StorageProvider>(
        &self,
        context_id: Uuid,
        original: &ChatContext,
        storage: &T,
    ) -> Result<bool> {
        info!(
            context_id = %context_id,
            "Validating migration"
        );

        // Load from new storage
        let loaded = match storage.load_context(context_id).await? {
            Some(ctx) => ctx,
            None => {
                error!(
                    context_id = %context_id,
                    "Context not found in new storage"
                );
                return Ok(false);
            }
        };

        // Compare basic properties
        if loaded.id != original.id {
            error!(
                context_id = %context_id,
                "Context ID mismatch"
            );
            return Ok(false);
        }

        // Compare message count
        if loaded.message_pool.len() != original.message_pool.len() {
            error!(
                context_id = %context_id,
                original_count = original.message_pool.len(),
                loaded_count = loaded.message_pool.len(),
                "Message count mismatch"
            );
            return Ok(false);
        }

        // Verify all message IDs exist
        for (msg_id, _) in &original.message_pool {
            if !loaded.message_pool.contains_key(msg_id) {
                error!(
                    context_id = %context_id,
                    message_id = %msg_id,
                    "Message missing in migrated data"
                );
                return Ok(false);
            }
        }

        // Compare branch count
        if loaded.branches.len() != original.branches.len() {
            error!(
                context_id = %context_id,
                original_count = original.branches.len(),
                loaded_count = loaded.branches.len(),
                "Branch count mismatch"
            );
            return Ok(false);
        }

        info!(
            context_id = %context_id,
            message_count = loaded.message_pool.len(),
            branch_count = loaded.branches.len(),
            "Migration validation passed"
        );

        Ok(true)
    }

    /// Migrate all contexts from legacy to new format
    ///
    /// # Arguments
    /// * `storage` - The new storage provider
    /// * `delete_legacy` - Whether to delete legacy files after successful migration
    ///
    /// # Returns
    /// A report containing the results of each migration
    pub async fn migrate_all<T: StorageProvider>(
        &self,
        storage: &T,
        delete_legacy: bool,
    ) -> Result<MigrationReport> {
        info!("Starting batch migration");

        let context_ids = self.detect_legacy_data().await?;
        let total = context_ids.len();

        if total == 0 {
            info!("No legacy data found, migration not needed");
            return Ok(MigrationReport {
                total,
                successful: 0,
                failed: 0,
                results: Vec::new(),
            });
        }

        let mut results = Vec::new();
        let mut successful = 0;
        let mut failed = 0;

        for context_id in context_ids {
            match self.migrate_context(context_id, storage, delete_legacy).await {
                Ok(result) => {
                    if result.success {
                        successful += 1;
                    } else {
                        failed += 1;
                    }
                    results.push(result);
                }
                Err(e) => {
                    error!(
                        context_id = %context_id,
                        error = %e,
                        "Migration failed with error"
                    );
                    failed += 1;
                    results.push(MigrationResult {
                        context_id,
                        success: false,
                        backup_path: None,
                        message_count: 0,
                        error: Some(e.to_string()),
                    });
                }
            }
        }

        let report = MigrationReport {
            total,
            successful,
            failed,
            results,
        };

        info!(
            total = report.total,
            successful = report.successful,
            failed = report.failed,
            "Batch migration completed"
        );

        Ok(report)
    }
}

/// Result of migrating a single context
#[derive(Debug, Clone)]
pub struct MigrationResult {
    pub context_id: Uuid,
    pub success: bool,
    pub backup_path: Option<PathBuf>,
    pub message_count: usize,
    pub error: Option<String>,
}

/// Report of batch migration
#[derive(Debug)]
pub struct MigrationReport {
    pub total: usize,
    pub successful: usize,
    pub failed: usize,
    pub results: Vec<MigrationResult>,
}

impl MigrationReport {
    /// Print a summary of the migration
    pub fn print_summary(&self) {
        println!("\n=== Migration Summary ===");
        println!("Total contexts: {}", self.total);
        println!("Successful: {}", self.successful);
        println!("Failed: {}", self.failed);
        println!("Success rate: {:.1}%", (self.successful as f64 / self.total as f64) * 100.0);

        if self.failed > 0 {
            println!("\nFailed migrations:");
            for result in &self.results {
                if !result.success {
                    println!(
                        "  - {}: {}",
                        result.context_id,
                        result.error.as_deref().unwrap_or("Unknown error")
                    );
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::message_pool_provider::MessagePoolStorageProvider;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_detect_legacy_data() {
        let temp_dir = TempDir::new().unwrap();
        let legacy_dir = temp_dir.path().join("conversations");
        fs::create_dir_all(&legacy_dir).await.unwrap();

        // Create some legacy files
        let id1 = Uuid::new_v4();
        let id2 = Uuid::new_v4();
        fs::write(legacy_dir.join(format!("{}.json", id1)), "{}").await.unwrap();
        fs::write(legacy_dir.join(format!("{}.json", id2)), "{}").await.unwrap();
        fs::write(legacy_dir.join("not_a_uuid.json"), "{}").await.unwrap();

        let migration = StorageMigration::new(&legacy_dir, temp_dir.path().join("backups"));
        let detected = migration.detect_legacy_data().await.unwrap();

        assert_eq!(detected.len(), 2);
        assert!(detected.contains(&id1));
        assert!(detected.contains(&id2));
    }

    #[tokio::test]
    async fn test_backup_context() {
        let temp_dir = TempDir::new().unwrap();
        let legacy_dir = temp_dir.path().join("conversations");
        let backup_dir = temp_dir.path().join("backups");
        fs::create_dir_all(&legacy_dir).await.unwrap();

        let context_id = Uuid::new_v4();
        let content = r#"{"id":"test","message_pool":{},"branches":{}}"#;
        fs::write(legacy_dir.join(format!("{}.json", context_id)), content).await.unwrap();

        let migration = StorageMigration::new(&legacy_dir, &backup_dir);
        let backup_path = migration.backup_context(context_id).await.unwrap();

        assert!(backup_path.exists());
        let backup_content = fs::read_to_string(&backup_path).await.unwrap();
        assert_eq!(backup_content, content);
    }

    #[tokio::test]
    async fn test_full_migration() {
        let temp_dir = TempDir::new().unwrap();
        let legacy_dir = temp_dir.path().join("conversations");
        let backup_dir = temp_dir.path().join("backups");
        let storage_dir = temp_dir.path().join("storage");
        
        fs::create_dir_all(&legacy_dir).await.unwrap();

        // Create a legacy context
        let context_id = Uuid::new_v4();
        let context = ChatContext::new(
            context_id,
            "test-model".to_string(),
            "code".to_string(),
        );

        // Add a message
        use context_manager::structs::message::{InternalMessage, Role};
        let mut context_with_message = context.clone();
        let message = InternalMessage {
            role: Role::User,
            content: vec![],
            tool_calls: None,
            tool_result: None,
            message_type: context_manager::MessageType::Text,
            metadata: Default::default(),
            rich_type: None,
        };
        context_with_message.add_message_to_branch("main", message);

        // Save in legacy format
        let legacy_path = legacy_dir.join(format!("{}.json", context_id));
        let content = serde_json::to_string_pretty(&context_with_message).unwrap();
        fs::write(&legacy_path, content).await.unwrap();

        // Run migration
        let migration = StorageMigration::new(&legacy_dir, &backup_dir);
        let storage = MessagePoolStorageProvider::new(&storage_dir);
        
        let result = migration.migrate_context(context_id, &storage, false).await.unwrap();

        assert!(result.success);
        assert_eq!(result.message_count, 1);
        assert!(result.backup_path.is_some());

        // Verify new storage
        let loaded = storage.load_context(context_id).await.unwrap().unwrap();
        assert_eq!(loaded.id, context_id);
        assert_eq!(loaded.message_pool.len(), 1);
    }

    #[tokio::test]
    async fn test_batch_migration() {
        let temp_dir = TempDir::new().unwrap();
        let legacy_dir = temp_dir.path().join("conversations");
        let backup_dir = temp_dir.path().join("backups");
        let storage_dir = temp_dir.path().join("storage");
        
        fs::create_dir_all(&legacy_dir).await.unwrap();

        // Create multiple legacy contexts
        for _ in 0..3 {
            let context_id = Uuid::new_v4();
            let context = ChatContext::new(
                context_id,
                "test-model".to_string(),
                "code".to_string(),
            );
            
            let legacy_path = legacy_dir.join(format!("{}.json", context_id));
            let content = serde_json::to_string_pretty(&context).unwrap();
            fs::write(&legacy_path, content).await.unwrap();
        }

        // Run batch migration
        let migration = StorageMigration::new(&legacy_dir, &backup_dir);
        let storage = MessagePoolStorageProvider::new(&storage_dir);
        
        let report = migration.migrate_all(&storage, false).await.unwrap();

        assert_eq!(report.total, 3);
        assert_eq!(report.successful, 3);
        assert_eq!(report.failed, 0);
    }
}

