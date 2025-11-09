//! Session Manager service

use crate::error::{Result, SessionError};
use crate::storage::SessionStorage;
use crate::structs::{UserSession, UIState, UserPreferences};
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

/// Session Manager - manages user sessions
pub struct SessionManager<S: SessionStorage> {
    storage: Arc<S>,
    current_session: Arc<RwLock<UserSession>>,
    session_id: String,
}

impl<S: SessionStorage> SessionManager<S> {
    /// Create a new SessionManager
    pub async fn new(storage: S, session_id: String) -> Result<Self> {
        let storage = Arc::new(storage);
        
        // Load or create session
        let session = match storage.load_session(&session_id).await {
            Ok(session) => session,
            Err(SessionError::NotFound) => {
                let new_session = UserSession::default();
                storage.save_session(&session_id, &new_session).await?;
                new_session
            }
            Err(e) => return Err(e),
        };
        
        Ok(Self {
            storage,
            current_session: Arc::new(RwLock::new(session)),
            session_id,
        })
    }
    
    /// Get the current session
    pub async fn get_session(&self) -> UserSession {
        self.current_session.read().await.clone()
    }
    
    /// Update the entire session
    pub async fn update_session(&self, session: UserSession) -> Result<()> {
        *self.current_session.write().await = session.clone();
        self.storage.save_session(&self.session_id, &session).await
    }
    
    /// Set the active context
    pub async fn set_active_context(&self, context_id: Option<Uuid>) -> Result<()> {
        let mut session = self.current_session.write().await;
        session.set_active_context(context_id);
        self.storage.save_session(&self.session_id, &session).await
    }
    
    /// Open a context (add to tabs)
    pub async fn open_context(&self, context_id: Uuid, title: String) -> Result<()> {
        let mut session = self.current_session.write().await;
        session.open_context(context_id, title);
        self.storage.save_session(&self.session_id, &session).await
    }
    
    /// Close a context (remove from tabs)
    pub async fn close_context(&self, context_id: Uuid) -> Result<bool> {
        let mut session = self.current_session.write().await;
        let closed = session.close_context(context_id);
        if closed {
            self.storage.save_session(&self.session_id, &session).await?;
        }
        Ok(closed)
    }
    
    /// Reorder contexts
    pub async fn reorder_contexts(&self, new_order: Vec<Uuid>) -> Result<()> {
        let mut session = self.current_session.write().await;
        session.reorder_contexts(new_order);
        self.storage.save_session(&self.session_id, &session).await
    }
    
    /// Update UI state
    pub async fn update_ui_state(&self, ui_state: UIState) -> Result<()> {
        let mut session = self.current_session.write().await;
        session.ui_state = ui_state;
        self.storage.save_session(&self.session_id, &session).await
    }
    
    /// Update user preferences
    pub async fn update_preferences(&self, preferences: UserPreferences) -> Result<()> {
        let mut session = self.current_session.write().await;
        session.preferences = preferences;
        self.storage.save_session(&self.session_id, &session).await
    }
    
    /// Get current UI state
    pub async fn get_ui_state(&self) -> UIState {
        self.current_session.read().await.ui_state.clone()
    }
    
    /// Get current preferences
    pub async fn get_preferences(&self) -> UserPreferences {
        self.current_session.read().await.preferences.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::FileSessionStorage;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_session_manager_new() {
        let dir = tempdir().unwrap();
        let storage = FileSessionStorage::new(dir.path());
        let manager = SessionManager::new(storage, "test".to_string())
            .await
            .unwrap();
        
        let session = manager.get_session().await;
        assert!(session.open_contexts.is_empty());
    }

    #[tokio::test]
    async fn test_session_manager_open_close_context() {
        let dir = tempdir().unwrap();
        let storage = FileSessionStorage::new(dir.path());
        let manager = SessionManager::new(storage, "test".to_string())
            .await
            .unwrap();
        
        let ctx_id = Uuid::new_v4();
        manager
            .open_context(ctx_id, "Test Context".to_string())
            .await
            .unwrap();
        
        let session = manager.get_session().await;
        assert_eq!(session.open_contexts.len(), 1);
        
        let closed = manager.close_context(ctx_id).await.unwrap();
        assert!(closed);
        
        let session = manager.get_session().await;
        assert_eq!(session.open_contexts.len(), 0);
    }

    #[tokio::test]
    async fn test_session_manager_set_active_context() {
        let dir = tempdir().unwrap();
        let storage = FileSessionStorage::new(dir.path());
        let manager = SessionManager::new(storage, "test".to_string())
            .await
            .unwrap();
        
        let ctx_id = Uuid::new_v4();
        manager
            .open_context(ctx_id, "Test".to_string())
            .await
            .unwrap();
        manager.set_active_context(Some(ctx_id)).await.unwrap();
        
        let session = manager.get_session().await;
        assert_eq!(session.active_context_id, Some(ctx_id));
    }

    #[tokio::test]
    async fn test_session_manager_update_ui_state() {
        let dir = tempdir().unwrap();
        let storage = FileSessionStorage::new(dir.path());
        let manager = SessionManager::new(storage, "test".to_string())
            .await
            .unwrap();
        
        let mut ui_state = UIState::default();
        ui_state.sidebar_collapsed = true;
        ui_state.sidebar_width = 350;
        
        manager.update_ui_state(ui_state.clone()).await.unwrap();
        
        let loaded_ui_state = manager.get_ui_state().await;
        assert_eq!(loaded_ui_state.sidebar_collapsed, true);
        assert_eq!(loaded_ui_state.sidebar_width, 350);
    }

    #[tokio::test]
    async fn test_session_manager_persistence() {
        let dir = tempdir().unwrap();
        let storage = FileSessionStorage::new(dir.path());
        
        let ctx_id = Uuid::new_v4();
        {
            let manager = SessionManager::new(storage.clone(), "test".to_string())
                .await
                .unwrap();
            manager
                .open_context(ctx_id, "Test".to_string())
                .await
                .unwrap();
        }
        
        // Create a new manager with the same session_id
        let manager = SessionManager::new(storage, "test".to_string())
            .await
            .unwrap();
        let session = manager.get_session().await;
        
        assert_eq!(session.open_contexts.len(), 1);
        assert_eq!(session.open_contexts[0].context_id, ctx_id);
    }
}

