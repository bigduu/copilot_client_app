use anyhow::{Context, Result};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;
use zstd::stream::{decode_all, encode_all};

use super::{
    Checkpoint, CheckpointPaths, CheckpointResult, FileSnapshot, SessionTimeline, TimelineNode,
};

pub struct CheckpointStorage {
    pub claude_dir: PathBuf,
    compression_level: i32,
}

impl CheckpointStorage {
    pub fn new(claude_dir: PathBuf) -> Self {
        Self {
            claude_dir,
            compression_level: 3,
        }
    }

    pub fn init_storage(&self, project_id: &str, session_id: &str) -> Result<()> {
        let paths = CheckpointPaths::new(&self.claude_dir, project_id, session_id);

        fs::create_dir_all(&paths.checkpoints_dir)
            .context("Failed to create checkpoints directory")?;
        fs::create_dir_all(&paths.files_dir).context("Failed to create files directory")?;

        if !paths.timeline_file.exists() {
            let timeline = SessionTimeline::new(session_id.to_string());
            self.save_timeline(&paths.timeline_file, &timeline)?;
        }

        Ok(())
    }

    pub fn save_checkpoint(
        &self,
        project_id: &str,
        session_id: &str,
        checkpoint: &Checkpoint,
        file_snapshots: Vec<FileSnapshot>,
        messages: &str,
    ) -> Result<CheckpointResult> {
        let paths = CheckpointPaths::new(&self.claude_dir, project_id, session_id);
        let checkpoint_dir = paths.checkpoint_dir(&checkpoint.id);

        fs::create_dir_all(&checkpoint_dir).context("Failed to create checkpoint directory")?;

        let metadata_path = paths.checkpoint_metadata_file(&checkpoint.id);
        let metadata_json = serde_json::to_string_pretty(checkpoint)
            .context("Failed to serialize checkpoint metadata")?;
        fs::write(&metadata_path, metadata_json).context("Failed to write checkpoint metadata")?;

        let messages_path = paths.checkpoint_messages_file(&checkpoint.id);
        let compressed_messages = encode_all(messages.as_bytes(), self.compression_level)
            .context("Failed to compress messages")?;
        fs::write(&messages_path, compressed_messages)
            .context("Failed to write compressed messages")?;

        let mut warnings = Vec::new();
        let mut files_processed = 0;

        for snapshot in &file_snapshots {
            match self.save_file_snapshot(&paths, snapshot) {
                Ok(_) => files_processed += 1,
                Err(e) => warnings.push(format!(
                    "Failed to save {}: {}",
                    snapshot.file_path.display(),
                    e
                )),
            }
        }

        self.update_timeline_with_checkpoint(&paths.timeline_file, checkpoint, &file_snapshots)?;

        Ok(CheckpointResult {
            checkpoint: checkpoint.clone(),
            files_processed,
            warnings,
        })
    }

    fn save_file_snapshot(&self, paths: &CheckpointPaths, snapshot: &FileSnapshot) -> Result<()> {
        let content_pool_dir = paths.files_dir.join("content_pool");
        fs::create_dir_all(&content_pool_dir).context("Failed to create content pool directory")?;

        let content_file = content_pool_dir.join(&snapshot.hash);

        if !content_file.exists() {
            let compressed_content =
                encode_all(snapshot.content.as_bytes(), self.compression_level)
                    .context("Failed to compress file content")?;
            fs::write(&content_file, compressed_content)
                .context("Failed to write file content to pool")?;
        }

        let checkpoint_refs_dir = paths.files_dir.join("refs").join(&snapshot.checkpoint_id);
        fs::create_dir_all(&checkpoint_refs_dir)
            .context("Failed to create checkpoint refs directory")?;

        let ref_metadata = serde_json::json!({
            "path": snapshot.file_path,
            "hash": snapshot.hash,
            "is_deleted": snapshot.is_deleted,
            "permissions": snapshot.permissions,
            "size": snapshot.size,
        });

        let safe_filename = snapshot
            .file_path
            .to_string_lossy()
            .replace('/', "_")
            .replace('\\', "_");
        let ref_path = checkpoint_refs_dir.join(format!("{}.json", safe_filename));

        fs::write(&ref_path, serde_json::to_string_pretty(&ref_metadata)?)
            .context("Failed to write file reference")?;

        Ok(())
    }

    pub fn load_checkpoint(
        &self,
        project_id: &str,
        session_id: &str,
        checkpoint_id: &str,
    ) -> Result<(Checkpoint, Vec<FileSnapshot>, String)> {
        let paths = CheckpointPaths::new(&self.claude_dir, project_id, session_id);

        let metadata_path = paths.checkpoint_metadata_file(checkpoint_id);
        let metadata_json =
            fs::read_to_string(&metadata_path).context("Failed to read checkpoint metadata")?;
        let checkpoint: Checkpoint =
            serde_json::from_str(&metadata_json).context("Failed to parse checkpoint metadata")?;

        let messages_path = paths.checkpoint_messages_file(checkpoint_id);
        let compressed_messages =
            fs::read(&messages_path).context("Failed to read compressed messages")?;
        let messages = String::from_utf8(
            decode_all(&compressed_messages[..]).context("Failed to decompress messages")?,
        )
        .context("Invalid UTF-8 in messages")?;

        let file_snapshots = self.load_file_snapshots(&paths, checkpoint_id)?;

        Ok((checkpoint, file_snapshots, messages))
    }

    fn load_file_snapshots(
        &self,
        paths: &CheckpointPaths,
        checkpoint_id: &str,
    ) -> Result<Vec<FileSnapshot>> {
        let refs_dir = paths.files_dir.join("refs").join(checkpoint_id);
        if !refs_dir.exists() {
            return Ok(Vec::new());
        }

        let content_pool_dir = paths.files_dir.join("content_pool");
        let mut snapshots = Vec::new();

        for entry in fs::read_dir(&refs_dir)? {
            let entry = entry?;
            let path = entry.path();

            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }

            let ref_json = fs::read_to_string(&path).context("Failed to read file reference")?;
            let ref_metadata: serde_json::Value =
                serde_json::from_str(&ref_json).context("Failed to parse file reference")?;

            let hash = ref_metadata["hash"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("Missing hash in reference"))?;

            let content_file = content_pool_dir.join(hash);
            let content = if content_file.exists() {
                let compressed_content =
                    fs::read(&content_file).context("Failed to read file content from pool")?;
                String::from_utf8(
                    decode_all(&compressed_content[..])
                        .context("Failed to decompress file content")?,
                )
                .context("Invalid UTF-8 in file content")?
            } else {
                log::warn!("Content file missing for hash: {}", hash);
                String::new()
            };

            snapshots.push(FileSnapshot {
                checkpoint_id: checkpoint_id.to_string(),
                file_path: PathBuf::from(ref_metadata["path"].as_str().unwrap_or("")),
                content,
                hash: hash.to_string(),
                is_deleted: ref_metadata["is_deleted"].as_bool().unwrap_or(false),
                permissions: ref_metadata["permissions"].as_u64().map(|p| p as u32),
                size: ref_metadata["size"].as_u64().unwrap_or(0),
            });
        }

        Ok(snapshots)
    }

    pub fn save_timeline(&self, timeline_path: &Path, timeline: &SessionTimeline) -> Result<()> {
        let timeline_json =
            serde_json::to_string_pretty(timeline).context("Failed to serialize timeline")?;
        fs::write(timeline_path, timeline_json).context("Failed to write timeline")?;
        Ok(())
    }

    pub fn load_timeline(&self, timeline_path: &Path) -> Result<SessionTimeline> {
        let timeline_json = fs::read_to_string(timeline_path).context("Failed to read timeline")?;
        let timeline: SessionTimeline =
            serde_json::from_str(&timeline_json).context("Failed to parse timeline")?;
        Ok(timeline)
    }

    fn update_timeline_with_checkpoint(
        &self,
        timeline_path: &Path,
        checkpoint: &Checkpoint,
        file_snapshots: &[FileSnapshot],
    ) -> Result<()> {
        let mut timeline = self.load_timeline(timeline_path)?;

        let new_node = TimelineNode {
            checkpoint: checkpoint.clone(),
            children: Vec::new(),
            file_snapshot_ids: file_snapshots.iter().map(|s| s.hash.clone()).collect(),
        };

        if timeline.root_node.is_none() {
            timeline.root_node = Some(new_node);
            timeline.current_checkpoint_id = Some(checkpoint.id.clone());
        } else if let Some(parent_id) = &checkpoint.parent_checkpoint_id {
            let parent_exists = timeline.find_checkpoint(parent_id).is_some();

            if parent_exists {
                if let Some(root) = &mut timeline.root_node {
                    Self::add_child_to_node(root, parent_id, new_node)?;
                    timeline.current_checkpoint_id = Some(checkpoint.id.clone());
                }
            } else {
                anyhow::bail!("Parent checkpoint not found: {}", parent_id);
            }
        }

        timeline.total_checkpoints += 1;
        self.save_timeline(timeline_path, &timeline)?;

        Ok(())
    }

    fn add_child_to_node(
        node: &mut TimelineNode,
        parent_id: &str,
        child: TimelineNode,
    ) -> Result<()> {
        if node.checkpoint.id == parent_id {
            node.children.push(child);
            return Ok(());
        }

        for child_node in &mut node.children {
            if Self::add_child_to_node(child_node, parent_id, child.clone()).is_ok() {
                return Ok(());
            }
        }

        anyhow::bail!("Parent checkpoint not found: {}", parent_id)
    }

    pub fn calculate_file_hash(content: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(content.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    pub fn generate_checkpoint_id() -> String {
        Uuid::new_v4().to_string()
    }

    pub fn estimate_checkpoint_size(messages: &str, file_snapshots: &[FileSnapshot]) -> u64 {
        let messages_size = messages.len() as u64;
        let files_size: u64 = file_snapshots.iter().map(|s| s.content.len() as u64).sum();

        (messages_size + files_size) / 4
    }

    pub fn cleanup_old_checkpoints(
        &self,
        project_id: &str,
        session_id: &str,
        keep_count: usize,
    ) -> Result<usize> {
        let paths = CheckpointPaths::new(&self.claude_dir, project_id, session_id);
        let timeline = self.load_timeline(&paths.timeline_file)?;

        let mut all_checkpoints = Vec::new();
        if let Some(root) = &timeline.root_node {
            Self::collect_checkpoints(root, &mut all_checkpoints);
        }

        all_checkpoints.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

        let to_remove = all_checkpoints.len().saturating_sub(keep_count);
        let mut removed_count = 0;

        for checkpoint in all_checkpoints.into_iter().take(to_remove) {
            if self.remove_checkpoint(&paths, &checkpoint.id).is_ok() {
                removed_count += 1;
            }
        }

        if removed_count > 0 {
            match self.garbage_collect_content(project_id, session_id) {
                Ok(gc_count) => {
                    log::info!("Garbage collected {} orphaned content files", gc_count);
                }
                Err(e) => {
                    log::warn!("Failed to garbage collect content: {}", e);
                }
            }
        }

        Ok(removed_count)
    }

    fn collect_checkpoints(node: &TimelineNode, checkpoints: &mut Vec<Checkpoint>) {
        checkpoints.push(node.checkpoint.clone());
        for child in &node.children {
            Self::collect_checkpoints(child, checkpoints);
        }
    }

    fn remove_checkpoint(&self, paths: &CheckpointPaths, checkpoint_id: &str) -> Result<()> {
        let checkpoint_dir = paths.checkpoint_dir(checkpoint_id);
        if checkpoint_dir.exists() {
            fs::remove_dir_all(&checkpoint_dir).context("Failed to remove checkpoint directory")?;
        }

        let refs_dir = paths.files_dir.join("refs").join(checkpoint_id);
        if refs_dir.exists() {
            fs::remove_dir_all(&refs_dir).context("Failed to remove file references")?;
        }

        Ok(())
    }

    pub fn garbage_collect_content(&self, project_id: &str, session_id: &str) -> Result<usize> {
        let paths = CheckpointPaths::new(&self.claude_dir, project_id, session_id);
        let content_pool_dir = paths.files_dir.join("content_pool");
        let refs_dir = paths.files_dir.join("refs");

        if !content_pool_dir.exists() {
            return Ok(0);
        }

        let mut referenced_hashes = std::collections::HashSet::new();

        if refs_dir.exists() {
            for checkpoint_entry in fs::read_dir(&refs_dir)? {
                let checkpoint_dir = checkpoint_entry?.path();
                if checkpoint_dir.is_dir() {
                    for ref_entry in fs::read_dir(&checkpoint_dir)? {
                        let ref_path = ref_entry?.path();
                        if ref_path.extension().and_then(|e| e.to_str()) == Some("json") {
                            if let Ok(ref_json) = fs::read_to_string(&ref_path) {
                                if let Ok(ref_metadata) =
                                    serde_json::from_str::<serde_json::Value>(&ref_json)
                                {
                                    if let Some(hash) = ref_metadata["hash"].as_str() {
                                        referenced_hashes.insert(hash.to_string());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        let mut removed_count = 0;
        for entry in fs::read_dir(&content_pool_dir)? {
            let content_file = entry?.path();
            if content_file.is_file() {
                if let Some(hash) = content_file.file_name().and_then(|n| n.to_str()) {
                    if !referenced_hashes.contains(hash) {
                        if fs::remove_file(&content_file).is_ok() {
                            removed_count += 1;
                        }
                    }
                }
            }
        }

        Ok(removed_count)
    }
}
