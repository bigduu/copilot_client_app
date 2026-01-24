use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

pub mod manager;
pub mod state;
pub mod storage;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Checkpoint {
    pub id: String,
    pub session_id: String,
    pub project_id: String,
    pub message_index: usize,
    pub timestamp: DateTime<Utc>,
    pub description: Option<String>,
    pub parent_checkpoint_id: Option<String>,
    pub metadata: CheckpointMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointMetadata {
    pub total_tokens: u64,
    pub model_used: String,
    pub user_prompt: String,
    pub file_changes: usize,
    pub snapshot_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSnapshot {
    pub checkpoint_id: String,
    pub file_path: PathBuf,
    pub content: String,
    pub hash: String,
    pub is_deleted: bool,
    pub permissions: Option<u32>,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineNode {
    pub checkpoint: Checkpoint,
    pub children: Vec<TimelineNode>,
    pub file_snapshot_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTimeline {
    pub session_id: String,
    pub root_node: Option<TimelineNode>,
    pub current_checkpoint_id: Option<String>,
    pub auto_checkpoint_enabled: bool,
    pub checkpoint_strategy: CheckpointStrategy,
    pub total_checkpoints: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CheckpointStrategy {
    Manual,
    PerPrompt,
    PerToolUse,
    Smart,
}

#[derive(Debug, Clone)]
pub struct FileTracker {
    pub tracked_files: HashMap<PathBuf, FileState>,
}

#[derive(Debug, Clone)]
pub struct FileState {
    pub last_hash: String,
    pub is_modified: bool,
    pub last_modified: DateTime<Utc>,
    pub exists: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CheckpointResult {
    pub checkpoint: Checkpoint,
    pub files_processed: usize,
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CheckpointDiff {
    pub from_checkpoint_id: String,
    pub to_checkpoint_id: String,
    pub modified_files: Vec<FileDiff>,
    pub added_files: Vec<PathBuf>,
    pub deleted_files: Vec<PathBuf>,
    pub token_delta: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileDiff {
    pub path: PathBuf,
    pub additions: usize,
    pub deletions: usize,
    pub diff_content: Option<String>,
}

impl Default for CheckpointStrategy {
    fn default() -> Self {
        CheckpointStrategy::Smart
    }
}

impl SessionTimeline {
    pub fn new(session_id: String) -> Self {
        Self {
            session_id,
            root_node: None,
            current_checkpoint_id: None,
            auto_checkpoint_enabled: false,
            checkpoint_strategy: CheckpointStrategy::default(),
            total_checkpoints: 0,
        }
    }

    pub fn find_checkpoint(&self, checkpoint_id: &str) -> Option<&TimelineNode> {
        self.root_node
            .as_ref()
            .and_then(|root| Self::find_in_tree(root, checkpoint_id))
    }

    fn find_in_tree<'a>(node: &'a TimelineNode, checkpoint_id: &str) -> Option<&'a TimelineNode> {
        if node.checkpoint.id == checkpoint_id {
            return Some(node);
        }

        for child in &node.children {
            if let Some(found) = Self::find_in_tree(child, checkpoint_id) {
                return Some(found);
            }
        }

        None
    }
}

pub struct CheckpointPaths {
    pub timeline_file: PathBuf,
    pub checkpoints_dir: PathBuf,
    pub files_dir: PathBuf,
}

impl CheckpointPaths {
    pub fn new(claude_dir: &PathBuf, project_id: &str, session_id: &str) -> Self {
        let base_dir = claude_dir
            .join("projects")
            .join(project_id)
            .join(".timelines")
            .join(session_id);

        Self {
            timeline_file: base_dir.join("timeline.json"),
            checkpoints_dir: base_dir.join("checkpoints"),
            files_dir: base_dir.join("files"),
        }
    }

    pub fn checkpoint_dir(&self, checkpoint_id: &str) -> PathBuf {
        self.checkpoints_dir.join(checkpoint_id)
    }

    pub fn checkpoint_metadata_file(&self, checkpoint_id: &str) -> PathBuf {
        self.checkpoint_dir(checkpoint_id).join("metadata.json")
    }

    pub fn checkpoint_messages_file(&self, checkpoint_id: &str) -> PathBuf {
        self.checkpoint_dir(checkpoint_id).join("messages.jsonl")
    }

    #[allow(dead_code)]
    pub fn file_snapshot_path(&self, _checkpoint_id: &str, file_hash: &str) -> PathBuf {
        self.files_dir.join("content_pool").join(file_hash)
    }

    #[allow(dead_code)]
    pub fn file_reference_path(&self, checkpoint_id: &str, safe_filename: &str) -> PathBuf {
        self.files_dir
            .join("refs")
            .join(checkpoint_id)
            .join(format!("{}.json", safe_filename))
    }
}
