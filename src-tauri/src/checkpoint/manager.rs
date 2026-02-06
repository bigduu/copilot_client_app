use anyhow::{Context, Result};
use chrono::{DateTime, TimeZone, Utc};
use log;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

use super::{
    storage::{self, CheckpointStorage},
    Checkpoint, CheckpointMetadata, CheckpointPaths, CheckpointResult, CheckpointStrategy,
    FileSnapshot, FileState, FileTracker, SessionTimeline,
};

pub struct CheckpointManager {
    project_id: String,
    session_id: String,
    project_path: PathBuf,
    file_tracker: Arc<RwLock<FileTracker>>,
    pub storage: Arc<CheckpointStorage>,
    timeline: Arc<RwLock<SessionTimeline>>,
    current_messages: Arc<RwLock<Vec<String>>>,
}

impl CheckpointManager {
    pub async fn new(
        project_id: String,
        session_id: String,
        project_path: PathBuf,
        claude_dir: PathBuf,
    ) -> Result<Self> {
        let storage = Arc::new(CheckpointStorage::new(claude_dir.clone()));

        storage.init_storage(&project_id, &session_id)?;

        let paths = CheckpointPaths::new(&claude_dir, &project_id, &session_id);
        let timeline = if paths.timeline_file.exists() {
            storage.load_timeline(&paths.timeline_file)?
        } else {
            SessionTimeline::new(session_id.clone())
        };

        let file_tracker = FileTracker {
            tracked_files: HashMap::new(),
        };

        Ok(Self {
            project_id,
            session_id,
            project_path,
            file_tracker: Arc::new(RwLock::new(file_tracker)),
            storage,
            timeline: Arc::new(RwLock::new(timeline)),
            current_messages: Arc::new(RwLock::new(Vec::new())),
        })
    }

    pub async fn track_message(&self, jsonl_message: String) -> Result<()> {
        let mut messages = self.current_messages.write().await;
        messages.push(jsonl_message.clone());

        if let Ok(msg) = serde_json::from_str::<serde_json::Value>(&jsonl_message) {
            if let Some(content) = msg.get("message").and_then(|m| m.get("content")) {
                if let Some(content_array) = content.as_array() {
                    for item in content_array {
                        if item.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                            if let Some(tool_name) = item.get("name").and_then(|n| n.as_str()) {
                                if let Some(input) = item.get("input") {
                                    self.track_tool_operation(tool_name, input).await?;
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }

    async fn track_tool_operation(&self, tool: &str, input: &serde_json::Value) -> Result<()> {
        match tool.to_lowercase().as_str() {
            "edit" | "write" | "multiedit" => {
                if let Some(file_path) = input.get("file_path").and_then(|p| p.as_str()) {
                    self.track_file_modification(file_path).await?;
                }
            }
            "bash" => {
                if let Some(command) = input.get("command").and_then(|c| c.as_str()) {
                    self.track_bash_side_effects(command).await?;
                }
            }
            _ => {}
        }
        Ok(())
    }

    pub async fn track_file_modification(&self, file_path: &str) -> Result<()> {
        let mut tracker = self.file_tracker.write().await;
        let full_path = self.project_path.join(file_path);

        let (hash, exists, _size, modified) = if full_path.exists() {
            let content = fs::read_to_string(&full_path).unwrap_or_default();
            let metadata = fs::metadata(&full_path)?;
            let modified = metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| {
                    Utc.timestamp_opt(d.as_secs() as i64, d.subsec_nanos())
                        .unwrap()
                })
                .unwrap_or_else(Utc::now);

            (
                storage::CheckpointStorage::calculate_file_hash(&content),
                true,
                metadata.len(),
                modified,
            )
        } else {
            (String::new(), false, 0, Utc::now())
        };

        let is_modified =
            if let Some(existing_state) = tracker.tracked_files.get(&PathBuf::from(file_path)) {
                existing_state.last_hash != hash
                    || existing_state.exists != exists
                    || existing_state.is_modified
            } else {
                true
            };

        tracker.tracked_files.insert(
            PathBuf::from(file_path),
            FileState {
                last_hash: hash,
                is_modified,
                last_modified: modified,
                exists,
            },
        );

        Ok(())
    }

    async fn track_bash_side_effects(&self, command: &str) -> Result<()> {
        let file_commands = [
            "echo", "cat", "cp", "mv", "rm", "touch", "sed", "awk", "npm", "yarn", "pnpm", "bun",
            "cargo", "make", "gcc", "g++",
        ];

        for cmd in &file_commands {
            if command.contains(cmd) {
                let mut tracker = self.file_tracker.write().await;
                for (_, state) in tracker.tracked_files.iter_mut() {
                    state.is_modified = true;
                }
                break;
            }
        }

        Ok(())
    }

    pub async fn create_checkpoint(
        &self,
        description: Option<String>,
        parent_checkpoint_id: Option<String>,
    ) -> Result<CheckpointResult> {
        let messages = self.current_messages.read().await;
        let message_index = messages.len().saturating_sub(1);

        let (user_prompt, model_used, total_tokens) =
            self.extract_checkpoint_metadata(&messages).await?;

        fn collect_files(
            dir: &std::path::Path,
            base: &std::path::Path,
            files: &mut Vec<std::path::PathBuf>,
        ) -> Result<(), std::io::Error> {
            for entry in std::fs::read_dir(dir)? {
                let entry = entry?;
                let path = entry.path();
                if path.is_dir() {
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        if name.starts_with('.') {
                            continue;
                        }
                    }
                    collect_files(&path, base, files)?;
                } else if path.is_file() {
                    if let Ok(rel) = path.strip_prefix(base) {
                        files.push(rel.to_path_buf());
                    }
                }
            }
            Ok(())
        }
        let mut all_files = Vec::new();
        let project_dir = &self.project_path;
        let _ = collect_files(project_dir.as_path(), project_dir.as_path(), &mut all_files);
        for rel in all_files {
            if let Some(p) = rel.to_str() {
                let _ = self.track_file_modification(p).await;
            }
        }

        let checkpoint_id = storage::CheckpointStorage::generate_checkpoint_id();

        let file_snapshots = self.create_file_snapshots(&checkpoint_id).await?;

        let checkpoint = Checkpoint {
            id: checkpoint_id.clone(),
            session_id: self.session_id.clone(),
            project_id: self.project_id.clone(),
            message_index,
            timestamp: Utc::now(),
            description,
            parent_checkpoint_id: {
                if let Some(parent_id) = parent_checkpoint_id {
                    Some(parent_id)
                } else {
                    let timeline = self.timeline.read().await;
                    timeline.current_checkpoint_id.clone()
                }
            },
            metadata: CheckpointMetadata {
                total_tokens,
                model_used,
                user_prompt,
                file_changes: file_snapshots.len(),
                snapshot_size: storage::CheckpointStorage::estimate_checkpoint_size(
                    &messages.join("\n"),
                    &file_snapshots,
                ),
            },
        };

        let messages_content = messages.join("\n");
        let result = self.storage.save_checkpoint(
            &self.project_id,
            &self.session_id,
            &checkpoint,
            file_snapshots,
            &messages_content,
        )?;

        let claude_dir = self.storage.claude_dir.clone();
        let paths = CheckpointPaths::new(&claude_dir, &self.project_id, &self.session_id);
        let updated_timeline = self.storage.load_timeline(&paths.timeline_file)?;
        {
            let mut timeline_lock = self.timeline.write().await;
            *timeline_lock = updated_timeline;
        }

        let mut timeline = self.timeline.write().await;
        timeline.current_checkpoint_id = Some(checkpoint_id);

        let mut tracker = self.file_tracker.write().await;
        for (_, state) in tracker.tracked_files.iter_mut() {
            state.is_modified = false;
        }

        Ok(result)
    }

    async fn extract_checkpoint_metadata(
        &self,
        messages: &[String],
    ) -> Result<(String, String, u64)> {
        let mut user_prompt = String::new();
        let mut model_used = String::from("unknown");
        let mut total_tokens = 0u64;

        for msg_str in messages.iter().rev() {
            if let Ok(msg) = serde_json::from_str::<serde_json::Value>(msg_str) {
                if msg.get("type").and_then(|t| t.as_str()) == Some("user") {
                    if let Some(content) = msg
                        .get("message")
                        .and_then(|m| m.get("content"))
                        .and_then(|c| c.as_array())
                    {
                        for item in content {
                            if item.get("type").and_then(|t| t.as_str()) == Some("text") {
                                if let Some(text) = item.get("text").and_then(|t| t.as_str()) {
                                    user_prompt = text.to_string();
                                    break;
                                }
                            }
                        }
                    }
                }

                if let Some(model) = msg.get("model").and_then(|m| m.as_str()) {
                    model_used = model.to_string();
                }

                if let Some(message) = msg.get("message") {
                    if let Some(model) = message.get("model").and_then(|m| m.as_str()) {
                        model_used = model.to_string();
                    }
                }

                if let Some(message) = msg.get("message") {
                    if let Some(usage) = message.get("usage") {
                        if let Some(input) = usage.get("input_tokens").and_then(|t| t.as_u64()) {
                            total_tokens += input;
                        }
                        if let Some(output) = usage.get("output_tokens").and_then(|t| t.as_u64()) {
                            total_tokens += output;
                        }
                        if let Some(cache_creation) = usage
                            .get("cache_creation_input_tokens")
                            .and_then(|t| t.as_u64())
                        {
                            total_tokens += cache_creation;
                        }
                        if let Some(cache_read) = usage
                            .get("cache_read_input_tokens")
                            .and_then(|t| t.as_u64())
                        {
                            total_tokens += cache_read;
                        }
                    }
                }

                if let Some(usage) = msg.get("usage") {
                    if let Some(input) = usage.get("input_tokens").and_then(|t| t.as_u64()) {
                        total_tokens += input;
                    }
                    if let Some(output) = usage.get("output_tokens").and_then(|t| t.as_u64()) {
                        total_tokens += output;
                    }
                    if let Some(cache_creation) = usage
                        .get("cache_creation_input_tokens")
                        .and_then(|t| t.as_u64())
                    {
                        total_tokens += cache_creation;
                    }
                    if let Some(cache_read) = usage
                        .get("cache_read_input_tokens")
                        .and_then(|t| t.as_u64())
                    {
                        total_tokens += cache_read;
                    }
                }
            }
        }

        Ok((user_prompt, model_used, total_tokens))
    }

    async fn create_file_snapshots(&self, checkpoint_id: &str) -> Result<Vec<FileSnapshot>> {
        let tracker = self.file_tracker.read().await;
        let mut snapshots = Vec::new();

        for (rel_path, state) in &tracker.tracked_files {
            if !state.is_modified {
                continue;
            }

            let full_path = self.project_path.join(rel_path);

            let (content, exists, permissions, size, current_hash) = if full_path.exists() {
                let content = fs::read_to_string(&full_path).unwrap_or_default();
                let current_hash = storage::CheckpointStorage::calculate_file_hash(&content);

                let metadata = fs::metadata(&full_path)?;
                let permissions = {
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        Some(metadata.permissions().mode())
                    }
                    #[cfg(not(unix))]
                    {
                        None
                    }
                };
                (content, true, permissions, metadata.len(), current_hash)
            } else {
                (String::new(), false, None, 0, String::new())
            };

            snapshots.push(FileSnapshot {
                checkpoint_id: checkpoint_id.to_string(),
                file_path: rel_path.clone(),
                content,
                hash: current_hash,
                is_deleted: !exists,
                permissions,
                size,
            });
        }

        Ok(snapshots)
    }

    pub async fn restore_checkpoint(&self, checkpoint_id: &str) -> Result<CheckpointResult> {
        let (checkpoint, file_snapshots, messages) =
            self.storage
                .load_checkpoint(&self.project_id, &self.session_id, checkpoint_id)?;

        fn collect_all_project_files(
            dir: &std::path::Path,
            base: &std::path::Path,
            files: &mut Vec<std::path::PathBuf>,
        ) -> Result<(), std::io::Error> {
            for entry in std::fs::read_dir(dir)? {
                let entry = entry?;
                let path = entry.path();
                if path.is_dir() {
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        if name.starts_with('.') {
                            continue;
                        }
                    }
                    collect_all_project_files(&path, base, files)?;
                } else if path.is_file() {
                    if let Ok(rel) = path.strip_prefix(base) {
                        files.push(rel.to_path_buf());
                    }
                }
            }
            Ok(())
        }

        let mut current_files = Vec::new();
        let _ =
            collect_all_project_files(&self.project_path, &self.project_path, &mut current_files);

        let mut checkpoint_files = std::collections::HashSet::new();
        for snapshot in &file_snapshots {
            if !snapshot.is_deleted {
                checkpoint_files.insert(snapshot.file_path.clone());
            }
        }

        let mut warnings = Vec::new();
        let mut files_processed = 0;

        for current_file in current_files {
            if !checkpoint_files.contains(&current_file) {
                let full_path = self.project_path.join(&current_file);
                match fs::remove_file(&full_path) {
                    Ok(_) => {
                        files_processed += 1;
                        log::info!("Deleted file not in checkpoint: {:?}", current_file);
                    }
                    Err(e) => {
                        warnings.push(format!(
                            "Failed to delete {}: {}",
                            current_file.display(),
                            e
                        ));
                    }
                }
            }
        }

        fn remove_empty_dirs(
            dir: &std::path::Path,
            base: &std::path::Path,
        ) -> Result<bool, std::io::Error> {
            if dir == base {
                return Ok(false);
            }

            let mut is_empty = true;
            for entry in fs::read_dir(dir)? {
                let entry = entry?;
                let path = entry.path();
                if path.is_dir() {
                    if !remove_empty_dirs(&path, base)? {
                        is_empty = false;
                    }
                } else {
                    is_empty = false;
                }
            }

            if is_empty {
                fs::remove_dir(dir)?;
                Ok(true)
            } else {
                Ok(false)
            }
        }

        let _ = remove_empty_dirs(&self.project_path, &self.project_path);

        for snapshot in &file_snapshots {
            match self.restore_file_snapshot(snapshot).await {
                Ok(_) => files_processed += 1,
                Err(e) => warnings.push(format!(
                    "Failed to restore {}: {}",
                    snapshot.file_path.display(),
                    e
                )),
            }
        }

        let mut current_messages = self.current_messages.write().await;
        current_messages.clear();
        for line in messages.lines() {
            current_messages.push(line.to_string());
        }

        let mut timeline = self.timeline.write().await;
        timeline.current_checkpoint_id = Some(checkpoint_id.to_string());

        let mut tracker = self.file_tracker.write().await;
        tracker.tracked_files.clear();
        for snapshot in &file_snapshots {
            if !snapshot.is_deleted {
                tracker.tracked_files.insert(
                    snapshot.file_path.clone(),
                    FileState {
                        last_hash: snapshot.hash.clone(),
                        is_modified: false,
                        last_modified: Utc::now(),
                        exists: true,
                    },
                );
            }
        }

        Ok(CheckpointResult {
            checkpoint: checkpoint.clone(),
            files_processed,
            warnings,
        })
    }

    async fn restore_file_snapshot(&self, snapshot: &FileSnapshot) -> Result<()> {
        let full_path = self.project_path.join(&snapshot.file_path);

        if snapshot.is_deleted {
            if full_path.exists() {
                fs::remove_file(&full_path).context("Failed to delete file")?;
            }
        } else {
            if let Some(parent) = full_path.parent() {
                fs::create_dir_all(parent).context("Failed to create parent directories")?;
            }

            fs::write(&full_path, &snapshot.content).context("Failed to write file")?;

            #[cfg(unix)]
            if let Some(mode) = snapshot.permissions {
                use std::os::unix::fs::PermissionsExt;
                let permissions = std::fs::Permissions::from_mode(mode);
                fs::set_permissions(&full_path, permissions)
                    .context("Failed to set file permissions")?;
            }
        }

        Ok(())
    }

    pub async fn get_timeline(&self) -> SessionTimeline {
        self.timeline.read().await.clone()
    }

    pub async fn list_checkpoints(&self) -> Vec<Checkpoint> {
        let timeline = self.timeline.read().await;
        let mut checkpoints = Vec::new();

        if let Some(root) = &timeline.root_node {
            Self::collect_checkpoints_from_node(root, &mut checkpoints);
        }

        checkpoints
    }

    fn collect_checkpoints_from_node(
        node: &super::TimelineNode,
        checkpoints: &mut Vec<Checkpoint>,
    ) {
        checkpoints.push(node.checkpoint.clone());
        for child in &node.children {
            Self::collect_checkpoints_from_node(child, checkpoints);
        }
    }

    pub async fn fork_from_checkpoint(
        &self,
        checkpoint_id: &str,
        description: Option<String>,
    ) -> Result<CheckpointResult> {
        let (_base_checkpoint, _, _) =
            self.storage
                .load_checkpoint(&self.project_id, &self.session_id, checkpoint_id)?;

        self.restore_checkpoint(checkpoint_id).await?;

        let fork_description =
            description.unwrap_or_else(|| format!("Fork from checkpoint {}", &checkpoint_id[..8]));

        self.create_checkpoint(Some(fork_description), Some(checkpoint_id.to_string()))
            .await
    }

    pub async fn should_auto_checkpoint(&self, message: &str) -> bool {
        let timeline = self.timeline.read().await;

        if !timeline.auto_checkpoint_enabled {
            return false;
        }

        match timeline.checkpoint_strategy {
            CheckpointStrategy::Manual => false,
            CheckpointStrategy::PerPrompt => {
                if let Ok(msg) = serde_json::from_str::<serde_json::Value>(message) {
                    msg.get("type").and_then(|t| t.as_str()) == Some("user")
                } else {
                    false
                }
            }
            CheckpointStrategy::PerToolUse => {
                if let Ok(msg) = serde_json::from_str::<serde_json::Value>(message) {
                    if let Some(content) = msg
                        .get("message")
                        .and_then(|m| m.get("content"))
                        .and_then(|c| c.as_array())
                    {
                        content.iter().any(|item| {
                            item.get("type").and_then(|t| t.as_str()) == Some("tool_use")
                        })
                    } else {
                        false
                    }
                } else {
                    false
                }
            }
            CheckpointStrategy::Smart => {
                if let Ok(msg) = serde_json::from_str::<serde_json::Value>(message) {
                    if let Some(content) = msg
                        .get("message")
                        .and_then(|m| m.get("content"))
                        .and_then(|c| c.as_array())
                    {
                        content.iter().any(|item| {
                            if item.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                                let tool_name =
                                    item.get("name").and_then(|n| n.as_str()).unwrap_or("");
                                matches!(
                                    tool_name.to_lowercase().as_str(),
                                    "write" | "edit" | "multiedit" | "bash" | "rm" | "delete"
                                )
                            } else {
                                false
                            }
                        })
                    } else {
                        false
                    }
                } else {
                    false
                }
            }
        }
    }

    pub async fn update_settings(
        &self,
        auto_checkpoint_enabled: bool,
        checkpoint_strategy: CheckpointStrategy,
    ) -> Result<()> {
        let mut timeline = self.timeline.write().await;
        timeline.auto_checkpoint_enabled = auto_checkpoint_enabled;
        timeline.checkpoint_strategy = checkpoint_strategy;

        let claude_dir = self.storage.claude_dir.clone();
        let paths = CheckpointPaths::new(&claude_dir, &self.project_id, &self.session_id);
        self.storage
            .save_timeline(&paths.timeline_file, &timeline)?;

        Ok(())
    }

    pub async fn get_files_modified_since(&self, since: DateTime<Utc>) -> Vec<PathBuf> {
        let tracker = self.file_tracker.read().await;
        tracker
            .tracked_files
            .iter()
            .filter(|(_, state)| state.last_modified > since && state.is_modified)
            .map(|(path, _)| path.clone())
            .collect()
    }

    pub async fn get_last_modification_time(&self) -> Option<DateTime<Utc>> {
        let tracker = self.file_tracker.read().await;
        tracker
            .tracked_files
            .values()
            .map(|state| state.last_modified)
            .max()
    }
}
