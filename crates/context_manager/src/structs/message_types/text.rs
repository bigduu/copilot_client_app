//! Text message types and formatting

use serde::{Deserialize, Serialize};

/// Plain text message with optional formatting
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TextMessage {
    pub content: String,

    /// Optional display text (different from actual content sent to LLM)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_text: Option<String>,

    /// Text formatting hints
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub formatting: Option<TextFormatting>,
}

/// Text formatting options
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TextFormatting {
    pub markdown: bool,
    pub code_block: Option<String>, // language hint
    pub highlighted_ranges: Vec<(usize, usize)>,
}

impl TextMessage {
    pub fn new<S: Into<String>>(content: S) -> Self {
        Self {
            content: content.into(),
            display_text: None,
            formatting: None,
        }
    }

    pub fn with_display<S: Into<String>>(content: S, display: S) -> Self {
        Self {
            content: content.into(),
            display_text: Some(display.into()),
            formatting: None,
        }
    }
}
