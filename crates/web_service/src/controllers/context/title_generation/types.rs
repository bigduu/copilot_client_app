//! Title generation types and DTOs

use serde::{Deserialize, Serialize};

// ============================================================================
// Request/Response Types
// ============================================================================

#[derive(Deserialize, Debug, Default)]
pub struct GenerateTitleRequest {
    pub max_length: Option<usize>,
    pub message_limit: Option<usize>,
    pub fallback_title: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct GenerateTitleResponse {
    pub title: String,
}

// ============================================================================
// Internal Types
// ============================================================================

/// Parameters for title generation (internal use)
#[derive(Debug, Clone)]
pub(super) struct TitleGenerationParams {
    pub max_length: usize,
    pub message_limit: usize,
    pub fallback_title: String,
}

impl Default for TitleGenerationParams {
    fn default() -> Self {
        Self {
            max_length: 60,
            message_limit: 6,
            fallback_title: "New Chat".to_string(),
        }
    }
}
