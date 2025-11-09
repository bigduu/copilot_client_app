// ! Multi-User Session Manager - manages multiple user sessions with caching

use crate::error::{Result, SessionError};
use crate::storage::SessionStorage;
use crate::structs::{UserSession, UserPreferences};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

/// Multi-User Session Manager - manages sessions for multiple users
pub struct MultiUserSessionManager<S: SessionStorage> {
    storage: Arc<S>,
    /// In-memory cache of active sessions (user_id -> session)
    sessions: Arc<RwLock<HashMap<String, Arc<RwLock<UserSession>>>>>,
}

impl<S: SessionStorage> MultiUserSessionManager<S> {
    /// Create a new MultiUserSessionManager
    pub fn new(storage: S) -> Self {
        Self {
            storage: Arc::new(storage),
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Get or create a user session
    pub async fn get_session(&self, user_id: &str) -> Result<UserSession> {
        // Check cache first
        {
            let sessions = self.sessions.read().await;
            if let Some(session_lock) = sessions.get(user_id) {
                return Ok(session_lock.read().await.clone());
            }
        }

        // Load from storage or create new
        let session = match self.storage.load_session(user_id).await {
            Ok(mut session) => {
                // Update user_id if not set
                if session.user_id.is_none() || session.user_id.as_ref().unwrap().is_empty() {
                    session.user_id = Some(user_id.to_string());
                }
                session
            }
            Err(SessionError::NotFound) => {
                let mut new_session = UserSession::default();
                new_session.user_id = Some(user_id.to_string());
                self.storage.save_session(user_id, &new_session).await?;
                new_session
            }
            Err(e) => return Err(e),
        };

        // Add to cache
        {
            let mut sessions = self.sessions.write().await;
            sessions.insert(
                user_id.to_string(),
                Arc::new(RwLock::new(session.clone())),
            );
        }

        Ok(session)
    }

    /// Update and persist a session
    async fn update_session(&self, user_id: &str, session: UserSession) -> Result<()> {
        // Update cache
        {
            let mut sessions = self.sessions.write().await;
            if let Some(session_lock) = sessions.get(user_id) {
                *session_lock.write().await = session.clone();
            } else {
                sessions.insert(user_id.to_string(), Arc::new(RwLock::new(session.clone())));
            }
        }

        // Persist to storage
        self.storage.save_session(user_id, &session).await
    }

    /// Set the active context for a user
    pub async fn set_active_context(&self, user_id: &str, context_id: Option<String>) -> Result<()> {
        let mut session = self.get_session(user_id).await?;
        session.active_context_id = context_id.and_then(|s| Uuid::parse_str(&s).ok());
        session.last_updated = chrono::Utc::now();
        self.update_session(user_id, session).await
    }

    /// Open a context (add to tabs) for a user
    pub async fn open_context(&self, user_id: &str, context_id: &str, title: &str) -> Result<()> {
        let mut session = self.get_session(user_id).await?;
        
        let ctx_uuid = Uuid::parse_str(context_id)
            .map_err(|e| SessionError::Validation(format!("Invalid UUID: {}", e)))?;
        
        // Check if already open
        if !session.open_contexts.iter().any(|oc| oc.context_id == ctx_uuid) {
            let order = session.open_contexts.len();
            session.open_contexts.push(crate::structs::OpenContext {
                context_id: ctx_uuid,
                title: title.to_string(),
                last_access_time: chrono::Utc::now(),
                order,
                pinned: false,
            });
        }
        
        session.last_updated = chrono::Utc::now();
        self.update_session(user_id, session).await
    }

    /// Close a context (remove from tabs) for a user
    pub async fn close_context(&self, user_id: &str, context_id: &str) -> Result<bool> {
        let mut session = self.get_session(user_id).await?;
        
        let ctx_uuid = Uuid::parse_str(context_id)
            .map_err(|e| SessionError::Validation(format!("Invalid UUID: {}", e)))?;
        
        let initial_len = session.open_contexts.len();
        session.open_contexts.retain(|oc| oc.context_id != ctx_uuid);
        let was_removed = session.open_contexts.len() < initial_len;
        
        if was_removed {
            // Reorder remaining contexts
            for (i, oc) in session.open_contexts.iter_mut().enumerate() {
                oc.order = i;
            }
            
            // Clear active context if it was the one closed
            if session.active_context_id == Some(ctx_uuid) {
                session.active_context_id = None;
            }
            
            session.last_updated = chrono::Utc::now();
            self.update_session(user_id, session).await?;
        }
        
        Ok(was_removed)
    }

    /// Update UI state for a user (stores in metadata field)
    pub async fn update_ui_state(&self, user_id: &str, key: &str, value: Value) -> Result<()> {
        let mut session = self.get_session(user_id).await?;
        session.metadata.insert(key.to_string(), value);
        session.last_updated = chrono::Utc::now();
        self.update_session(user_id, session).await
    }

    /// Update user preferences
    pub async fn update_preferences(&self, user_id: &str, preferences: UserPreferences) -> Result<()> {
        let mut session = self.get_session(user_id).await?;
        session.preferences = preferences;
        session.last_updated = chrono::Utc::now();
        self.update_session(user_id, session).await
    }

    /// Clear cache for a user (forces reload from storage on next access)
    pub async fn clear_cache(&self, user_id: &str) {
        let mut sessions = self.sessions.write().await;
        sessions.remove(user_id);
    }

    /// Clear all cached sessions
    pub async fn clear_all_cache(&self) {
        let mut sessions = self.sessions.write().await;
        sessions.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::FileSessionStorage;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_multi_user_session_manager() {
        let temp_dir = TempDir::new().unwrap();
        let storage = FileSessionStorage::new(temp_dir.path().to_path_buf());
        let manager = MultiUserSessionManager::new(storage);

        // Test get or create session
        let session1 = manager.get_session("user1").await.unwrap();
        assert_eq!(session1.user_id, Some("user1".to_string()));

        // Test open context with a valid UUID
        let ctx_uuid = Uuid::new_v4();
        manager
            .open_context("user1", &ctx_uuid.to_string(), "Context 1")
            .await
            .unwrap();
        let session1 = manager.get_session("user1").await.unwrap();
        assert_eq!(session1.open_contexts.len(), 1);
        assert_eq!(session1.open_contexts[0].context_id, ctx_uuid);

        // Test set active context
        manager
            .set_active_context("user1", Some(ctx_uuid.to_string()))
            .await
            .unwrap();
        let session1 = manager.get_session("user1").await.unwrap();
        assert_eq!(session1.active_context_id, Some(ctx_uuid));

        // Test close context
        let was_removed = manager.close_context("user1", &ctx_uuid.to_string()).await.unwrap();
        assert!(was_removed);
        let session1 = manager.get_session("user1").await.unwrap();
        assert_eq!(session1.open_contexts.len(), 0);
        assert_eq!(session1.active_context_id, None);

        // Test multiple users
        let session2 = manager.get_session("user2").await.unwrap();
        assert_eq!(session2.user_id, Some("user2".to_string()));
    }

    #[tokio::test]
    async fn test_ui_state_update() {
        let temp_dir = TempDir::new().unwrap();
        let storage = FileSessionStorage::new(temp_dir.path().to_path_buf());
        let manager = MultiUserSessionManager::new(storage);

        manager
            .update_ui_state("user1", "sidebar_width", Value::from(300))
            .await
            .unwrap();

        let session = manager.get_session("user1").await.unwrap();
        assert_eq!(session.metadata.get("sidebar_width"), Some(&Value::from(300)));
    }

    #[tokio::test]
    async fn test_preferences_update() {
        let temp_dir = TempDir::new().unwrap();
        let storage = FileSessionStorage::new(temp_dir.path().to_path_buf());
        let manager = MultiUserSessionManager::new(storage);

        let mut prefs = UserPreferences::default();
        prefs.font_size = 16;
        prefs.language = "zh-CN".to_string();

        manager
            .update_preferences("user1", prefs.clone())
            .await
            .unwrap();

        let session = manager.get_session("user1").await.unwrap();
        assert_eq!(session.preferences.font_size, 16);
        assert_eq!(session.preferences.language, "zh-CN");
    }
}

