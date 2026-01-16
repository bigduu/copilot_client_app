//! Session data structures

use chrono::{DateTime, Utc};
use context_manager::ToolApprovalPolicy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

/// User session state - managed by backend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSession {
    /// User ID for future multi-user support
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    
    /// Currently active context ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_context_id: Option<Uuid>,
    
    /// List of open contexts (tabs)
    pub open_contexts: Vec<OpenContext>,
    
    /// UI state
    pub ui_state: UIState,
    
    /// User preferences
    pub preferences: UserPreferences,
    
    /// Last time the session was updated
    pub last_updated: DateTime<Utc>,
    
    /// Session metadata
    #[serde(default)]
    pub metadata: HashMap<String, serde_json::Value>,
}

impl Default for UserSession {
    fn default() -> Self {
        Self {
            user_id: None,
            active_context_id: None,
            open_contexts: Vec::new(),
            ui_state: UIState::default(),
            preferences: UserPreferences::default(),
            last_updated: Utc::now(),
            metadata: HashMap::new(),
        }
    }
}

/// Open context information (for tabs)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OpenContext {
    /// Context ID
    pub context_id: Uuid,
    
    /// Display title
    pub title: String,
    
    /// Last access time
    pub last_access_time: DateTime<Utc>,
    
    /// Tab order (0-based)
    pub order: usize,
    
    /// Whether this tab is pinned
    #[serde(default)]
    pub pinned: bool,
}

/// UI state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UIState {
    /// Whether the sidebar is collapsed
    pub sidebar_collapsed: bool,
    
    /// Sidebar width in pixels
    pub sidebar_width: u32,
    
    /// Per-context expansion state (for tree views, etc.)
    #[serde(default)]
    pub context_expanded: HashMap<Uuid, bool>,
    
    /// Active panel name (e.g., "chat", "settings", "tools")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_panel: Option<String>,
    
    /// Message view mode (e.g., "normal", "compact", "detailed")
    #[serde(default = "default_message_view_mode")]
    pub message_view_mode: String,
    
    /// Whether to show system messages
    #[serde(default = "default_true")]
    pub show_system_messages: bool,
    
    /// Whether to auto-scroll to bottom
    #[serde(default = "default_true")]
    pub auto_scroll: bool,
}

fn default_message_view_mode() -> String {
    "normal".to_string()
}

fn default_true() -> bool {
    true
}

impl Default for UIState {
    fn default() -> Self {
        Self {
            sidebar_collapsed: false,
            sidebar_width: 280,
            context_expanded: HashMap::new(),
            active_panel: Some("chat".to_string()),
            message_view_mode: "normal".to_string(),
            show_system_messages: true,
            auto_scroll: true,
        }
    }
}

/// User preferences
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPreferences {
    /// UI theme
    pub theme: Theme,
    
    /// Font size in pixels
    pub font_size: u32,
    
    /// Whether to auto-save contexts
    pub auto_save: bool,
    
    /// Default LLM model
    pub default_model: String,
    
    /// Tool approval policy
    pub tool_approval_policy: ToolApprovalPolicy,
    
    /// Language preference (e.g., "en", "zh-CN")
    #[serde(default = "default_language")]
    pub language: String,
    
    /// Code syntax highlighting theme
    #[serde(default = "default_code_theme")]
    pub code_theme: String,
    
    /// Whether to enable keyboard shortcuts
    #[serde(default = "default_true")]
    pub enable_shortcuts: bool,
    
    /// Whether to send telemetry
    #[serde(default)]
    pub send_telemetry: bool,
}

fn default_language() -> String {
    "en".to_string()
}

fn default_code_theme() -> String {
    "github-dark".to_string()
}

impl Default for UserPreferences {
    fn default() -> Self {
        Self {
            theme: Theme::Auto,
            font_size: 14,
            auto_save: true,
            default_model: "gpt-5-mini".to_string(),
            tool_approval_policy: ToolApprovalPolicy::default(),
            language: "en".to_string(),
            code_theme: "github-dark".to_string(),
            enable_shortcuts: true,
            send_telemetry: false,
        }
    }
}

/// UI theme
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Light,
    Dark,
    Auto, // Follow system preference
}

impl Default for Theme {
    fn default() -> Self {
        Self::Auto
    }
}

// Helper methods for UserSession
impl UserSession {
    /// Create a new default session
    pub fn new() -> Self {
        Self::default()
    }
    
    /// Add or update an open context
    pub fn open_context(&mut self, context_id: Uuid, title: String) {
        // Check if context is already open
        if let Some(ctx) = self.open_contexts.iter_mut().find(|c| c.context_id == context_id) {
            ctx.last_access_time = Utc::now();
            ctx.title = title;
            return;
        }
        
        // Add new context
        let order = self.open_contexts.len();
        self.open_contexts.push(OpenContext {
            context_id,
            title,
            last_access_time: Utc::now(),
            order,
            pinned: false,
        });
        self.last_updated = Utc::now();
    }
    
    /// Close a context
    pub fn close_context(&mut self, context_id: Uuid) -> bool {
        if let Some(pos) = self.open_contexts.iter().position(|c| c.context_id == context_id) {
            self.open_contexts.remove(pos);
            // Reorder remaining contexts
            for (i, ctx) in self.open_contexts.iter_mut().enumerate() {
                ctx.order = i;
            }
            self.last_updated = Utc::now();
            
            // Clear active if it was the closed context
            if self.active_context_id == Some(context_id) {
                self.active_context_id = None;
            }
            true
        } else {
            false
        }
    }
    
    /// Set the active context
    pub fn set_active_context(&mut self, context_id: Option<Uuid>) {
        self.active_context_id = context_id;
        
        // Update last access time
        if let Some(ctx_id) = context_id {
            if let Some(ctx) = self.open_contexts.iter_mut().find(|c| c.context_id == ctx_id) {
                ctx.last_access_time = Utc::now();
            }
        }
        
        self.last_updated = Utc::now();
    }
    
    /// Reorder open contexts
    pub fn reorder_contexts(&mut self, new_order: Vec<Uuid>) {
        let mut new_contexts = Vec::new();
        for (i, ctx_id) in new_order.iter().enumerate() {
            if let Some(mut ctx) = self.open_contexts.iter()
                .find(|c| c.context_id == *ctx_id)
                .cloned()
            {
                ctx.order = i;
                new_contexts.push(ctx);
            }
        }
        self.open_contexts = new_contexts;
        self.last_updated = Utc::now();
    }
    
    /// Get context by ID
    pub fn get_open_context(&self, context_id: Uuid) -> Option<&OpenContext> {
        self.open_contexts.iter().find(|c| c.context_id == context_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_user_session() {
        let session = UserSession::default();
        assert!(session.user_id.is_none());
        assert!(session.active_context_id.is_none());
        assert!(session.open_contexts.is_empty());
    }

    #[test]
    fn test_open_context() {
        let mut session = UserSession::new();
        let ctx_id = Uuid::new_v4();
        
        session.open_context(ctx_id, "Test Context".to_string());
        
        assert_eq!(session.open_contexts.len(), 1);
        assert_eq!(session.open_contexts[0].context_id, ctx_id);
        assert_eq!(session.open_contexts[0].title, "Test Context");
        assert_eq!(session.open_contexts[0].order, 0);
    }

    #[test]
    fn test_close_context() {
        let mut session = UserSession::new();
        let ctx_id = Uuid::new_v4();
        
        session.open_context(ctx_id, "Test".to_string());
        assert_eq!(session.open_contexts.len(), 1);
        
        let closed = session.close_context(ctx_id);
        assert!(closed);
        assert_eq!(session.open_contexts.len(), 0);
    }

    #[test]
    fn test_set_active_context() {
        let mut session = UserSession::new();
        let ctx_id = Uuid::new_v4();
        
        session.open_context(ctx_id, "Test".to_string());
        session.set_active_context(Some(ctx_id));
        
        assert_eq!(session.active_context_id, Some(ctx_id));
    }

    #[test]
    fn test_reorder_contexts() {
        let mut session = UserSession::new();
        let ctx1 = Uuid::new_v4();
        let ctx2 = Uuid::new_v4();
        let ctx3 = Uuid::new_v4();
        
        session.open_context(ctx1, "Context 1".to_string());
        session.open_context(ctx2, "Context 2".to_string());
        session.open_context(ctx3, "Context 3".to_string());
        
        // Reorder: 3, 1, 2
        session.reorder_contexts(vec![ctx3, ctx1, ctx2]);
        
        assert_eq!(session.open_contexts[0].context_id, ctx3);
        assert_eq!(session.open_contexts[0].order, 0);
        assert_eq!(session.open_contexts[1].context_id, ctx1);
        assert_eq!(session.open_contexts[1].order, 1);
        assert_eq!(session.open_contexts[2].context_id, ctx2);
        assert_eq!(session.open_contexts[2].order, 2);
    }

    #[test]
    fn test_serialization() {
        let session = UserSession::default();
        let json = serde_json::to_string(&session).unwrap();
        let deserialized: UserSession = serde_json::from_str(&json).unwrap();
        
        assert_eq!(session.user_id, deserialized.user_id);
        assert_eq!(session.active_context_id, deserialized.active_context_id);
    }
}
