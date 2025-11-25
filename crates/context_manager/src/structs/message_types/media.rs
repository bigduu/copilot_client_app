//! Media message types (images, etc.)

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Image message with recognition results
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ImageMessage {
    /// Image data source
    pub image_data: ImageData,

    /// Recognition mode used or to be used
    pub recognition_mode: ImageRecognitionMode,

    /// OCR extracted text
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recognized_text: Option<String>,

    /// Vision model analysis result
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vision_analysis: Option<String>,

    /// Recognition error if any
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,

    /// Timestamp of recognition
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recognized_at: Option<DateTime<Utc>>,
}

/// Image data source variants
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ImageData {
    /// Remote image URL
    Url(String),

    /// Base64 encoded image
    Base64 { data: String, mime_type: String },

    /// Local file path
    FilePath(PathBuf),
}

/// Image recognition mode
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ImageRecognitionMode {
    /// Use LLM vision capability (e.g., GPT-4V)
    Vision,

    /// Use OCR engine (e.g., Tesseract)
    OCR,

    /// Auto-select: prefer Vision, fallback to OCR
    #[default]
    Auto,
}
