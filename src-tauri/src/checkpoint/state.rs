use anyhow::Result;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

use super::manager::CheckpointManager;

#[derive(Default, Clone)]
pub struct CheckpointState {
    managers: Arc<RwLock<HashMap<String, Arc<CheckpointManager>>>>,
    claude_dir: Arc<RwLock<Option<PathBuf>>>,
}

impl CheckpointState {
    pub fn new() -> Self {
        Self {
            managers: Arc::new(RwLock::new(HashMap::new())),
            claude_dir: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn set_claude_dir(&self, claude_dir: PathBuf) {
        let mut dir = self.claude_dir.write().await;
        *dir = Some(claude_dir);
    }

    pub async fn get_or_create_manager(
        &self,
        session_id: String,
        project_id: String,
        project_path: PathBuf,
    ) -> Result<Arc<CheckpointManager>> {
        let mut managers = self.managers.write().await;

        if let Some(manager) = managers.get(&session_id) {
            return Ok(Arc::clone(manager));
        }

        let claude_dir = {
            let dir = self.claude_dir.read().await;
            dir.as_ref()
                .ok_or_else(|| anyhow::anyhow!("Claude directory not set"))?
                .clone()
        };

        let manager =
            CheckpointManager::new(project_id, session_id.clone(), project_path, claude_dir)
                .await?;

        let manager_arc = Arc::new(manager);
        managers.insert(session_id, Arc::clone(&manager_arc));

        Ok(manager_arc)
    }

    #[allow(dead_code)]
    pub async fn get_manager(&self, session_id: &str) -> Option<Arc<CheckpointManager>> {
        let managers = self.managers.read().await;
        managers.get(session_id).map(Arc::clone)
    }

    pub async fn remove_manager(&self, session_id: &str) -> Option<Arc<CheckpointManager>> {
        let mut managers = self.managers.write().await;
        managers.remove(session_id)
    }

    #[allow(dead_code)]
    pub async fn clear_all(&self) {
        let mut managers = self.managers.write().await;
        managers.clear();
    }

    pub async fn active_count(&self) -> usize {
        let managers = self.managers.read().await;
        managers.len()
    }

    pub async fn list_active_sessions(&self) -> Vec<String> {
        let managers = self.managers.read().await;
        managers.keys().cloned().collect()
    }

    #[allow(dead_code)]
    pub async fn has_active_manager(&self, session_id: &str) -> bool {
        self.get_manager(session_id).await.is_some()
    }

    #[allow(dead_code)]
    pub async fn clear_all_and_count(&self) -> usize {
        let count = self.active_count().await;
        self.clear_all().await;
        count
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_checkpoint_state_lifecycle() {
        let state = CheckpointState::new();
        let temp_dir = TempDir::new().unwrap();
        let claude_dir = temp_dir.path().to_path_buf();

        state.set_claude_dir(claude_dir.clone()).await;

        let session_id = "test-session-123".to_string();
        let project_id = "test-project".to_string();
        let project_path = temp_dir.path().join("project");
        std::fs::create_dir_all(&project_path).unwrap();

        let manager1 = state
            .get_or_create_manager(session_id.clone(), project_id.clone(), project_path.clone())
            .await
            .unwrap();

        let manager2 = state
            .get_or_create_manager(session_id.clone(), project_id.clone(), project_path.clone())
            .await
            .unwrap();

        assert!(Arc::ptr_eq(&manager1, &manager2));
        assert_eq!(state.active_count().await, 1);

        let removed = state.remove_manager(&session_id).await;
        assert!(removed.is_some());
        assert_eq!(state.active_count().await, 0);

        let manager3 = state
            .get_or_create_manager(session_id.clone(), project_id, project_path)
            .await
            .unwrap();

        assert!(!Arc::ptr_eq(&manager1, &manager3));
    }
}
