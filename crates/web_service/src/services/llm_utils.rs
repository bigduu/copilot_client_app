use actix_web_lab::sse;
use log::error;
use tokio::sync::mpsc;

use context_manager::MessageType;
use serde_json::Value as JsonValue;

use context_manager::ContextUpdate;

pub async fn send_context_update(
    tx: &mpsc::Sender<sse::Event>,
    update: &ContextUpdate,
) -> Result<(), ()> {
    match serde_json::to_string(update) {
        Ok(json) => tx
            .send(sse::Event::Data(
                sse::Data::new(json).event("context_update"),
            ))
            .await
            .map_err(|_| ()),
        Err(err) => {
            error!("Failed to serialize ContextUpdate: {}", err);
            tx.send(sse::Event::Comment(
                format!("context_update_error:{}", err).into(),
            ))
            .await
            .map_err(|_| ())
        }
    }
}

/// Parse the LLM response text and determine the message type
pub fn detect_message_type(text: &str) -> MessageType {
    if let Some(json_str) = extract_json_from_text(text) {
        if let Ok(json) = serde_json::from_str::<JsonValue>(&json_str) {
            if json.get("goal").is_some() && json.get("steps").is_some() {
                return MessageType::Plan;
            }
            if json.get("type").and_then(|v| v.as_str()) == Some("question")
                && json.get("question").is_some()
            {
                return MessageType::Question;
            }
        }
    }

    MessageType::Text
}

/// Extract JSON from text that might be wrapped in markdown code blocks or mixed with other text
pub fn extract_json_from_text(text: &str) -> Option<String> {
    if let Some(start) = text.find("```json") {
        if let Some(end) = text[start + 7..].find("```") {
            return Some(text[start + 7..start + 7 + end].trim().to_string());
        }
    }

    if let Some(start) = text.find('{') {
        if let Some(end) = text.rfind('}') {
            if end > start {
                return Some(text[start..=end].trim().to_string());
            }
        }
    }

    None
}
