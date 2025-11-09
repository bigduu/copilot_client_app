//! Session storage trait and implementations

use crate::error::{Result, SessionError};
use crate::structs::UserSession;
use async_trait::async_trait;
use std::path::{Path, PathBuf};
use tokio::fs;

/// Session storage trait
#[async_trait]
pub trait SessionStorage: Send + Sync {
    /// Load a session
    async fn load_session(&self, session_id: &str) -> Result<UserSession>;
    
    /// Save a session
    async fn save_session(&self, session_id: &str, session: &UserSession) -> Result<()>;
    
    /// Check if a session exists
    async fn session_exists(&self, session_id: &str) -> bool;
    
    /// Delete a session
    async fn delete_session(&self, session_id: &str) -> Result<()>;
}

/// File-based session storage
#[derive(Clone)]
pub struct FileSessionStorage {
    base_path: PathBuf,
}

impl FileSessionStorage {
    pub fn new<P: AsRef<Path>>(base_path: P) -> Self {
        Self {
            base_path: base_path.as_ref().to_path_buf(),
        }
    }
    
    fn session_path(&self, session_id: &str) -> PathBuf {
        self.base_path.join(format!("{}.json", session_id))
    }
}

#[async_trait]
impl SessionStorage for FileSessionStorage {
    async fn load_session(&self, session_id: &str) -> Result<UserSession> {
        let path = self.session_path(session_id);
        
        if !path.exists() {
            return Err(SessionError::NotFound);
        }
        
        let contents = fs::read_to_string(&path).await?;
        let session: UserSession = serde_json::from_str(&contents)?;
        
        Ok(session)
    }
    
    async fn save_session(&self, session_id: &str, session: &UserSession) -> Result<()> {
        // Ensure directory exists
        if let Some(parent) = self.base_path.parent() {
            fs::create_dir_all(parent).await?;
        }
        fs::create_dir_all(&self.base_path).await?;
        
        let path = self.session_path(session_id);
        let contents = serde_json::to_string_pretty(session)?;
        
        fs::write(&path, contents).await?;
        
        Ok(())
    }
    
    async fn session_exists(&self, session_id: &str) -> bool {
        self.session_path(session_id).exists()
    }
    
    async fn delete_session(&self, session_id: &str) -> Result<()> {
        let path = self.session_path(session_id);
        
        if path.exists() {
            fs::remove_file(&path).await?;
        }
        
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_file_storage_save_and_load() {
        let dir = tempdir().unwrap();
        let storage = FileSessionStorage::new(dir.path());
        
        let session = UserSession::default();
        storage.save_session("test", &session).await.unwrap();
        
        let loaded = storage.load_session("test").await.unwrap();
        assert_eq!(session.user_id, loaded.user_id);
    }

    #[tokio::test]
    async fn test_file_storage_not_found() {
        let dir = tempdir().unwrap();
        let storage = FileSessionStorage::new(dir.path());
        
        let result = storage.load_session("nonexistent").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_file_storage_delete() {
        let dir = tempdir().unwrap();
        let storage = FileSessionStorage::new(dir.path());
        
        let session = UserSession::default();
        storage.save_session("test", &session).await.unwrap();
        
        assert!(storage.session_exists("test").await);
        
        storage.delete_session("test").await.unwrap();
        
        assert!(!storage.session_exists("test").await);
    }
}

