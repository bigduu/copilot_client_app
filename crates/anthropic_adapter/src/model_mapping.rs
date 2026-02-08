//! Anthropic Model Mapping
//!
//! Provides model name mapping between Anthropic and OpenAI models.
//! Supports capability-based mapping (background, thinking, long_context, default).

use chat_core::paths::anthropic_model_mapping_path;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Model capability categories
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelCapability {
    /// Default/general purpose model
    Default,
    /// Background/lightweight tasks (e.g., haiku, fast models)
    Background,
    /// Thinking/reasoning tasks (e.g., o1, reasoning models)
    Thinking,
    /// Long context tasks (e.g., models with 128k+ context)
    LongContext,
}

impl ModelCapability {
    /// Detect capability from Anthropic model name
    pub fn from_anthropic_model(model: &str) -> Self {
        let lower = model.to_lowercase();

        if lower.contains("haiku") || lower.contains("instant") {
            Self::Background
        } else if lower.contains("opus")
            || lower.contains("thinking")
            || lower.contains("reasoning")
        {
            Self::Thinking
        } else if lower.contains("200k") || lower.contains("128k") || lower.contains("long") {
            Self::LongContext
        } else {
            Self::Default
        }
    }

    /// Get environment variable name for this capability
    pub fn env_var(&self) -> &'static str {
        match self {
            Self::Default => "BODHI_MODEL_DEFAULT",
            Self::Background => "BODHI_MODEL_BACKGROUND",
            Self::Thinking => "BODHI_MODEL_THINKING",
            Self::LongContext => "BODHI_MODEL_LONG_CONTEXT",
        }
    }
}

impl std::fmt::Display for ModelCapability {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Default => write!(f, "default"),
            Self::Background => write!(f, "background"),
            Self::Thinking => write!(f, "thinking"),
            Self::LongContext => write!(f, "long_context"),
        }
    }
}

/// Capability-based model mapping configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CapabilityModelMapping {
    #[serde(default)]
    pub default_model: String,
    #[serde(default)]
    pub background_model: String,
    #[serde(default)]
    pub thinking_model: String,
    #[serde(default)]
    pub long_context_model: String,
}

impl CapabilityModelMapping {
    /// Load from environment variables and config file
    pub fn load() -> Self {
        let mut mapping = Self::default();

        // First, try to load from config file
        if let Ok(file_mapping) = Self::load_from_file() {
            mapping = file_mapping;
        }

        // Environment variables override config file
        if let Ok(v) = std::env::var("BODHI_MODEL_DEFAULT") {
            mapping.default_model = v;
        }
        if let Ok(v) = std::env::var("BODHI_MODEL_BACKGROUND") {
            mapping.background_model = v;
        }
        if let Ok(v) = std::env::var("BODHI_MODEL_THINKING") {
            mapping.thinking_model = v;
        }
        if let Ok(v) = std::env::var("BODHI_MODEL_LONG_CONTEXT") {
            mapping.long_context_model = v;
        }

        // Apply fallbacks for empty values
        mapping.apply_fallbacks();

        mapping
    }

    /// Load from config file
    fn load_from_file() -> Result<Self, ModelMappingError> {
        let path = anthropic_model_mapping_path();
        match std::fs::read(&path) {
            Ok(content) => {
                // Try to parse as new capability-based format first
                if let Ok(capability_mapping) =
                    serde_json::from_slice::<CapabilityModelMapping>(&content)
                {
                    return Ok(capability_mapping);
                }
                // Fall back to old format (model -> model mappings)
                if let Ok(old_mapping) =
                    serde_json::from_slice::<OldAnthropicModelMapping>(&content)
                {
                    return Ok(old_mapping.into_capability_mapping());
                }
                Err(ModelMappingError::JsonError(
                    serde_json::from_str::<serde_json::Value>("{}").unwrap_err(),
                ))
            }
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(Self::default()),
            Err(err) => Err(ModelMappingError::IoError(err)),
        }
    }

    /// Save to config file
    pub fn save(&self) -> Result<(), ModelMappingError> {
        let path = anthropic_model_mapping_path();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let data = serde_json::to_vec_pretty(self)?;
        std::fs::write(path, data)?;
        Ok(())
    }

    /// Apply fallback values for empty fields
    fn apply_fallbacks(&mut self) {
        if self.default_model.is_empty() {
            self.default_model = "gpt-4o".to_string();
        }
        if self.background_model.is_empty() {
            // Fallback to default if not set
            self.background_model = self.default_model.clone();
        }
        if self.thinking_model.is_empty() {
            // Fallback to default if not set
            self.thinking_model = self.default_model.clone();
        }
        if self.long_context_model.is_empty() {
            // Fallback to default if not set
            self.long_context_model = self.default_model.clone();
        }
    }

    /// Get model for a specific capability
    pub fn get_model(&self, capability: ModelCapability) -> &str {
        match capability {
            ModelCapability::Default => &self.default_model,
            ModelCapability::Background => &self.background_model,
            ModelCapability::Thinking => &self.thinking_model,
            ModelCapability::LongContext => &self.long_context_model,
        }
    }

    /// Set model for a specific capability
    pub fn set_model(&mut self, capability: ModelCapability, model: String) {
        match capability {
            ModelCapability::Default => self.default_model = model,
            ModelCapability::Background => self.background_model = model,
            ModelCapability::Thinking => self.thinking_model = model,
            ModelCapability::LongContext => self.long_context_model = model,
        }
    }

    /// Resolve Anthropic model to OpenAI model based on capability
    pub fn resolve_model(&self, anthropic_model: &str) -> String {
        let capability = ModelCapability::from_anthropic_model(anthropic_model);
        self.get_model(capability).to_string()
    }
}

/// Old format for backward compatibility
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct OldAnthropicModelMapping {
    #[serde(default)]
    mappings: HashMap<String, String>,
}

impl OldAnthropicModelMapping {
    fn into_capability_mapping(self) -> CapabilityModelMapping {
        let mut mapping = CapabilityModelMapping::default();

        // Try to infer capabilities from old mappings
        for (anthropic, openai) in self.mappings {
            let capability = ModelCapability::from_anthropic_model(&anthropic);
            match capability {
                ModelCapability::Default if mapping.default_model.is_empty() => {
                    mapping.default_model = openai;
                }
                ModelCapability::Background if mapping.background_model.is_empty() => {
                    mapping.background_model = openai;
                }
                ModelCapability::Thinking if mapping.thinking_model.is_empty() => {
                    mapping.thinking_model = openai;
                }
                ModelCapability::LongContext if mapping.long_context_model.is_empty() => {
                    mapping.long_context_model = openai;
                }
                _ => {}
            }
        }

        mapping.apply_fallbacks();
        mapping
    }
}

/// Model mapping errors
#[derive(Debug)]
pub enum ModelMappingError {
    IoError(std::io::Error),
    JsonError(serde_json::Error),
}

impl std::fmt::Display for ModelMappingError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::IoError(e) => write!(f, "IO error: {e}"),
            Self::JsonError(e) => write!(f, "JSON error: {e}"),
        }
    }
}

impl std::error::Error for ModelMappingError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::IoError(e) => Some(e),
            Self::JsonError(e) => Some(e),
        }
    }
}

impl From<std::io::Error> for ModelMappingError {
    fn from(err: std::io::Error) -> Self {
        Self::IoError(err)
    }
}

impl From<serde_json::Error> for ModelMappingError {
    fn from(err: serde_json::Error) -> Self {
        Self::JsonError(err)
    }
}

/// Model resolution result
#[derive(Debug, Clone)]
pub struct ModelResolution {
    pub original_model: String,
    pub mapped_model: String,
    pub response_model: String,
    pub capability: ModelCapability,
}

/// Resolve Anthropic model to OpenAI model
pub fn resolve_model(anthropic_model: &str) -> ModelResolution {
    let mapping = CapabilityModelMapping::load();
    let capability = ModelCapability::from_anthropic_model(anthropic_model);
    let mapped_model = mapping.resolve_model(anthropic_model);

    ModelResolution {
        original_model: anthropic_model.to_string(),
        mapped_model,
        response_model: anthropic_model.to_string(),
        capability,
    }
}

/// Default OpenAI model for a given Anthropic model
pub fn default_openai_model(anthropic_model: &str) -> &'static str {
    let lower = anthropic_model.to_lowercase();

    if lower.contains("haiku") || lower.contains("instant") {
        "gpt-4o-mini"
    } else if lower.contains("opus") {
        "gpt-4-turbo"
    } else if lower.contains("sonnet") {
        "gpt-4o"
    } else if lower.contains("claude-2") {
        "gpt-4"
    } else {
        "gpt-4o"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_capability_detection() {
        assert_eq!(
            ModelCapability::from_anthropic_model("claude-3-haiku"),
            ModelCapability::Background
        );
        assert_eq!(
            ModelCapability::from_anthropic_model("claude-3-opus"),
            ModelCapability::Thinking
        );
        assert_eq!(
            ModelCapability::from_anthropic_model("claude-3-sonnet"),
            ModelCapability::Default
        );
        assert_eq!(
            ModelCapability::from_anthropic_model("claude-instant"),
            ModelCapability::Background
        );
    }

    #[test]
    fn test_capability_env_vars() {
        assert_eq!(ModelCapability::Default.env_var(), "BODHI_MODEL_DEFAULT");
        assert_eq!(
            ModelCapability::Background.env_var(),
            "BODHI_MODEL_BACKGROUND"
        );
        assert_eq!(ModelCapability::Thinking.env_var(), "BODHI_MODEL_THINKING");
        assert_eq!(
            ModelCapability::LongContext.env_var(),
            "BODHI_MODEL_LONG_CONTEXT"
        );
    }

    #[test]
    fn test_mapping_apply_fallbacks() {
        let mut mapping = CapabilityModelMapping::default();
        mapping.apply_fallbacks();

        assert_eq!(mapping.default_model, "gpt-4o");
        assert_eq!(mapping.background_model, "gpt-4o");
        assert_eq!(mapping.thinking_model, "gpt-4o");
        assert_eq!(mapping.long_context_model, "gpt-4o");
    }
}
