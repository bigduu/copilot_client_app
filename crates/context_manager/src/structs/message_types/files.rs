//! File reference message types

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// File reference with resolved content
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FileRefMessage {
    /// File path (absolute or relative to workspace)
    pub path: String,

    /// Optional line range (1-indexed, inclusive)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line_range: Option<(usize, usize)>,

    /// Resolved file content
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolved_content: Option<String>,

    /// When the content was resolved
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolved_at: Option<DateTime<Utc>>,

    /// Resolution error if file couldn't be read
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolution_error: Option<String>,

    /// File metadata
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<FileMetadata>,
}

/// File metadata information
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FileMetadata {
    pub size_bytes: u64,
    pub mime_type: Option<String>,
    pub last_modified: Option<DateTime<Utc>>,
    pub line_count: Option<usize>,
}

impl FileRefMessage {
    pub fn new<S: Into<String>>(path: S) -> Self {
        Self {
            path: path.into(),
            line_range: None,
            resolved_content: None,
            resolved_at: None,
            resolution_error: None,
            metadata: None,
        }
    }

    pub fn with_range<S: Into<String>>(path: S, start: usize, end: usize) -> Self {
        Self {
            path: path.into(),
            line_range: Some((start, end)),
            resolved_content: None,
            resolved_at: None,
            resolution_error: None,
            metadata: None,
        }
    }
}
