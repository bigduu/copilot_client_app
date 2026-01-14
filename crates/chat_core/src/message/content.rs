//! ContentPart - Message content types
//!
//! Defines the different types of content that can appear in messages.

use serde::{Deserialize, Serialize};

/// A part of message content (text, image, etc.)
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentPart {
    /// Text content
    Text { text: String },

    /// Image content (base64 or URL)
    Image {
        /// Base64 encoded image data or URL
        source: ImageSource,
        /// Optional alt text
        alt_text: Option<String>,
    },

    /// File reference
    FileReference {
        /// Path to the file
        path: String,
        /// Display name
        display_name: Option<String>,
    },
}

impl ContentPart {
    /// Create a text content part
    pub fn text(text: impl Into<String>) -> Self {
        Self::Text { text: text.into() }
    }

    /// Create an image content part from base64
    pub fn image_base64(data: impl Into<String>, media_type: impl Into<String>) -> Self {
        Self::Image {
            source: ImageSource::Base64 {
                data: data.into(),
                media_type: media_type.into(),
            },
            alt_text: None,
        }
    }

    /// Create a file reference content part
    pub fn file_reference(path: impl Into<String>) -> Self {
        Self::FileReference {
            path: path.into(),
            display_name: None,
        }
    }

    /// Get text content if this is a text part
    pub fn as_text(&self) -> Option<&str> {
        match self {
            Self::Text { text } => Some(text),
            _ => None,
        }
    }
}

/// Image source (base64 or URL)
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ImageSource {
    /// Base64 encoded image data
    Base64 { data: String, media_type: String },
    /// URL to the image
    Url { url: String },
}

/// Container for message content parts
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct MessageContent {
    pub parts: Vec<ContentPart>,
}

impl MessageContent {
    /// Create empty content
    pub fn new() -> Self {
        Self::default()
    }

    /// Create content with a single text part
    pub fn text(text: impl Into<String>) -> Self {
        Self {
            parts: vec![ContentPart::text(text)],
        }
    }

    /// Add a content part
    pub fn push(&mut self, part: ContentPart) {
        self.parts.push(part);
    }

    /// Get all text content concatenated
    pub fn as_text(&self) -> String {
        self.parts
            .iter()
            .filter_map(|p| p.as_text())
            .collect::<Vec<_>>()
            .join("")
    }

    /// Check if content is empty
    pub fn is_empty(&self) -> bool {
        self.parts.is_empty()
    }
}

impl From<String> for MessageContent {
    fn from(text: String) -> Self {
        Self::text(text)
    }
}

impl From<&str> for MessageContent {
    fn from(text: &str) -> Self {
        Self::text(text)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_content_text() {
        let content = MessageContent::text("Hello, world!");
        assert_eq!(content.as_text(), "Hello, world!");
    }

    #[test]
    fn test_content_parts() {
        let mut content = MessageContent::new();
        content.push(ContentPart::text("Hello "));
        content.push(ContentPart::text("world!"));
        assert_eq!(content.as_text(), "Hello world!");
    }
}
