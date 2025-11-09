//! Parameter type definitions for workflows

use serde::{Deserialize, Serialize};

/// A parameter definition for a workflow
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Parameter {
    pub name: String,
    pub description: String,
    pub required: bool,
    #[serde(rename = "type")]
    pub param_type: String,
    pub default: Option<String>,
}

