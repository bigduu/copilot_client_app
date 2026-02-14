//! Tool output management for preventing large tool results from consuming the token budget.
//!
//! When tool results are too large, they are capped and stored as artifacts,
//! with a reference returned to the agent so it can retrieve the full content
//! when needed.

use std::io;
use std::path::PathBuf;

use agent_core::budget::counter::TokenCounter;
use agent_core::budget::HeuristicTokenCounter;

/// Reference to a stored artifact (full tool output stored externally).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArtifactRef {
    /// Unique identifier for the artifact
    pub id: String,
    /// Original tool call ID
    pub tool_call_id: String,
    /// Path to the stored artifact file
    pub path: PathBuf,
    /// Token count of the full content
    pub full_token_count: u32,
    /// Token count of the truncated content
    pub truncated_token_count: u32,
}

/// Manager for capping and storing large tool outputs.
#[derive(Debug)]
pub struct ToolOutputManager {
    /// Directory to store artifacts
    artifacts_dir: PathBuf,
    /// Maximum inline tokens for tool results
    max_inline_tokens: u32,
    /// Token counter
    counter: HeuristicTokenCounter,
}

impl ToolOutputManager {
    /// Create a new tool output manager.
    pub fn new(artifacts_dir: impl Into<PathBuf>, max_inline_tokens: u32) -> Self {
        Self {
            artifacts_dir: artifacts_dir.into(),
            max_inline_tokens,
            counter: HeuristicTokenCounter::default(),
        }
    }

    /// Create with default settings.
    ///
    /// Uses `~/.bamboo/artifacts` as the storage directory and 1000 tokens as the limit.
    pub fn with_defaults() -> Self {
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
        let artifacts_dir = home.join(".bamboo").join("artifacts");
        Self::new(artifacts_dir, 1000)
    }

    /// Cap a tool result if it exceeds the token limit.
    ///
    /// Returns a tuple of (capped_content, optional_artifact_ref).
    /// If the result fits within the budget, returns (result, None).
    /// If the result is too large, returns (truncated_result, Some(artifact_ref)).
    pub async fn cap_tool_result(
        &self,
        tool_call_id: &str,
        result: String,
    ) -> io::Result<(String, Option<ArtifactRef>)> {
        let token_count = self.counter.count_text(&result);

        // If within budget, return as-is
        if token_count <= self.max_inline_tokens {
            return Ok((result, None));
        }

        // Result is too large - truncate and store as artifact
        let truncated = self.truncate_to_token_limit(&result, self.max_inline_tokens);
        let truncated_token_count = self.counter.count_text(&truncated);

        // Store full result as artifact
        let artifact = self.store_artifact(tool_call_id, &result, token_count).await?;

        // Add reference to artifact in truncated output
        let capped = format!(
            "{}\n\n[Output truncated. Full result ({} tokens) stored as artifact: {}]\n[Use the retrieve_artifact tool with id '{}' to access the full output.]",
            truncated,
            token_count,
            artifact.path.display(),
            artifact.id
        );

        Ok((capped, Some(artifact)))
    }

    /// Truncate text to fit within a token budget.
    fn truncate_to_token_limit(&self, text: &str, max_tokens: u32) -> String {
        // Rough estimate: each token is about 4 characters
        // Use a conservative estimate to ensure we stay under the limit
        let max_chars = (max_tokens as f64 * 3.5) as usize;

        if text.len() <= max_chars {
            return text.to_string();
        }

        // Try to truncate at a natural boundary (newline or space)
        let truncate_at = text[..max_chars].rfind('\n')
            .or_else(|| text[..max_chars].rfind(' '))
            .unwrap_or(max_chars);

        format!("{}...", &text[..truncate_at])
    }

    /// Store the full result as an artifact file.
    async fn store_artifact(
        &self,
        tool_call_id: &str,
        content: &str,
        token_count: u32,
    ) -> io::Result<ArtifactRef> {
        // Ensure artifacts directory exists
        tokio::fs::create_dir_all(&self.artifacts_dir).await?;

        // Generate unique artifact ID
        let artifact_id = format!("{}_{}", tool_call_id, chrono::Utc::now().timestamp());
        let filename = format!("{}.txt", artifact_id);
        let artifact_path = self.artifacts_dir.join(&filename);

        // Write content to file
        tokio::fs::write(&artifact_path, content).await?;

        Ok(ArtifactRef {
            id: artifact_id,
            tool_call_id: tool_call_id.to_string(),
            path: artifact_path,
            full_token_count: token_count,
            truncated_token_count: self.max_inline_tokens,
        })
    }

    /// Retrieve a stored artifact by ID.
    pub async fn retrieve_artifact(&self, artifact_id: &str) -> io::Result<Option<String>> {
        let filename = format!("{}.txt", artifact_id);
        let path = self.artifacts_dir.join(&filename);

        if !path.exists() {
            return Ok(None);
        }

        let content = tokio::fs::read_to_string(&path).await?;
        Ok(Some(content))
    }

    /// List all stored artifacts.
    pub async fn list_artifacts(&self) -> io::Result<Vec<ArtifactRef>> {
        let mut artifacts = Vec::new();

        if !self.artifacts_dir.exists() {
            return Ok(artifacts);
        }

        let mut entries = tokio::fs::read_dir(&self.artifacts_dir).await?;
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "txt") {
                if let Some(stem) = path.file_stem() {
                    let id = stem.to_string_lossy().to_string();
                    let metadata = tokio::fs::metadata(&path).await?;

                    artifacts.push(ArtifactRef {
                        id,
                        tool_call_id: String::new(), // We don't store this separately in listing
                        path,
                        full_token_count: 0, // Would need to read file to calculate
                        truncated_token_count: 0,
                    });
                }
            }
        }

        Ok(artifacts)
    }

    /// Delete an artifact by ID.
    pub async fn delete_artifact(&self, artifact_id: &str) -> io::Result<bool> {
        let filename = format!("{}.txt", artifact_id);
        let path = self.artifacts_dir.join(&filename);

        if path.exists() {
            tokio::fs::remove_file(&path).await?;
            Ok(true)
        } else {
            Ok(false)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn cap_small_result_returns_as_is() {
        let dir = tempdir().unwrap();
        let manager = ToolOutputManager::new(dir.path(), 100);

        let result = "Small result".to_string();
        let (capped, artifact) = manager.cap_tool_result("call_1", result.clone()).await.unwrap();

        assert_eq!(capped, result);
        assert!(artifact.is_none());
    }

    #[tokio::test]
    async fn cap_large_result_stores_artifact() {
        let dir = tempdir().unwrap();
        let manager = ToolOutputManager::new(dir.path(), 100);

        // Create a large result (more than 100 tokens)
        let result = "x".repeat(1000);
        let (capped, artifact) = manager.cap_tool_result("call_1", result.clone()).await.unwrap();

        // Should be truncated
        assert!(capped.len() < result.len());
        assert!(artifact.is_some());

        let artifact = artifact.unwrap();
        assert_eq!(artifact.tool_call_id, "call_1");
        assert!(artifact.path.exists());

        // Should be able to retrieve full content
        let retrieved = manager.retrieve_artifact(&artifact.id).await.unwrap();
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap(), result);
    }

    #[test]
    fn truncate_preserves_word_boundary() {
        let dir = tempdir().unwrap();
        let manager = ToolOutputManager::new(dir.path(), 100);

        let text = "This is a sentence with multiple words to truncate properly.";
        let truncated = manager.truncate_to_token_limit(text, 10);

        // Should end at a space or newline, not mid-word
        assert!(!truncated.ends_with("sen"));
        assert!(truncated.ends_with("..."));
    }
}
