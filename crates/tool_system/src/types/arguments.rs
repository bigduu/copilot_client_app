use serde::{Deserialize, Serialize};

/// A flexible enum for tool arguments, making simple tools easier to define and call.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(untagged)]
pub enum ToolArguments {
    /// A single, unnamed string argument.
    String(String),
    /// A list of unnamed string arguments.
    StringList(Vec<String>),
    /// A complex, structured set of named arguments.
    Json(serde_json::Value),
}