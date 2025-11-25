//! Helper functions for title generation

use copilot_client::api::models::{Content, ContentPart as ClientContentPart};

/// Extract text content from a Content enum
pub fn extract_message_text(content: &Content) -> String {
    match content {
        Content::Text(text) => text.clone(),
        Content::Parts(parts) => parts
            .iter()
            .filter_map(|part| match part {
                ClientContentPart::Text { text } => Some(text.as_str()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("\n"),
    }
}

/// Sanitize and format a title string
pub fn sanitize_title(raw: &str, max_length: usize, fallback: &str) -> String {
    let first_line = raw.lines().next().unwrap_or("");
    let cleaned = first_line.trim().trim_matches(|c: char| match c {
        '"' | '\'' | '\u{201C}' | '\u{201D}' | '\u{2018}' | '\u{2019}' => true,
        _ => false,
    });

    if cleaned.is_empty() {
        return fallback.to_string();
    }

    let mut truncated: String = cleaned.chars().take(max_length).collect();
    if truncated.chars().count() == max_length && cleaned.chars().count() > max_length {
        if let Some(last_space) = truncated.rfind(' ') {
            truncated.truncate(last_space);
        }
    }

    let trimmed = truncated
        .trim()
        .trim_matches(|c: char| matches!(c, '.' | '-' | ':' | ','))
        .trim();

    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.to_string()
    }
}
