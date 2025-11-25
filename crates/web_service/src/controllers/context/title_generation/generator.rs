//! Core title generation logic - unified implementation to eliminate duplication

use super::{helpers, types::TitleGenerationParams};
use crate::{
    dto::{get_branch_messages, ContentPartDTO},
    server::AppState,
};
use copilot_client::api::models::{
    ChatCompletionRequest, ChatCompletionResponse, ChatMessage, Content,
    ContentPart as ClientContentPart, Role as ClientRole,
};
use std::sync::Arc;
use tokio::sync::RwLock;

/// Core title generation logic - single source of truth
///
/// This function eliminates the 90% code duplication between manual
/// and automatic title generation by providing a unified implementation.
pub async fn generate_title(
    app_state: &AppState,
    context: &Arc<RwLock<context_manager::structs::context::ChatContext>>,
    params: TitleGenerationParams,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    // 1. Extract conversation summary
    let conversation = extract_conversation_summary(context, params.message_limit).await?;

    if conversation.is_empty() {
        return Ok(params.fallback_title);
    }

    // 2. Get model ID
    let model_id = {
        let ctx = context.read().await;
        ctx.config.model_id.clone()
    };

    // 3. Build prompt
    let prompt = build_title_prompt(&conversation, params.max_length, &params.fallback_title);

    // 4. Generate title via LLM
    let raw_title = generate_via_llm(app_state, &prompt, &model_id).await?;

    // 5. Sanitize title
    let sanitized = helpers::sanitize_title(&raw_title, params.max_length, &params.fallback_title);

    // 6. Save to context
    save_title_to_context(context, &sanitized).await?;

    Ok(sanitized)
}

/// Extract conversation summary from context
async fn extract_conversation_summary(
    context: &Arc<RwLock<context_manager::structs::context::ChatContext>>,
    message_limit: usize,
) -> Result<Vec<String>, Box<dyn std::error::Error + Send + Sync>> {
    let ctx = context.read().await;
    let branch_messages = get_branch_messages(&ctx, &ctx.active_branch_name);

    let mut lines: Vec<String> = Vec::new();

    for message in branch_messages.iter().filter(|msg| {
        msg.role.eq_ignore_ascii_case("user") || msg.role.eq_ignore_ascii_case("assistant")
    }) {
        let text_parts: Vec<&str> = message
            .content
            .iter()
            .filter_map(|part| {
                if let ContentPartDTO::Text { text } = part {
                    if !text.trim().is_empty() {
                        return Some(text.trim());
                    }
                }
                None
            })
            .collect();

        if text_parts.is_empty() {
            continue;
        }

        let role_label = if message.role.eq_ignore_ascii_case("user") {
            "User"
        } else {
            "Assistant"
        };

        lines.push(format!("{}: {}", role_label, text_parts.join("\n")));
    }

    // Limit to most recent messages
    if lines.len() > message_limit {
        let start = lines.len() - message_limit;
        lines = lines.split_off(start);
    }

    Ok(lines)
}

/// Build prompt for title generation
fn build_title_prompt(conversation: &[String], max_length: usize, fallback: &str) -> String {
    let conversation_input = conversation.join("\n");
    format!(
        "You generate concise, descriptive chat titles. \
         Respond with Title Case text, without quotes or trailing punctuation. \
         Maximum length: {} characters. \
         If there is not enough context, respond with '{}'.\n\n\
         Conversation:\n{}",
        max_length, fallback, conversation_input
    )
}

/// Generate title via LLM (copilot_client)
///
/// Note: Ideally this should use ChatService, but for now we encapsulate
/// the copilot_client call in this single location to avoid duplication.
async fn generate_via_llm(
    app_state: &AppState,
    prompt: &str,
    model_id: &str,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let mut request = ChatCompletionRequest::default();
    request.model = model_id.to_string();
    request.stream = Some(false);
    request.messages = vec![ChatMessage {
        role: ClientRole::User,
        content: Content::Text(prompt.to_string()),
        tool_calls: None,
        tool_call_id: None,
    }];

    let response = app_state
        .copilot_client
        .send_chat_completion_request(request)
        .await?;

    let status = response.status();
    let body = response.bytes().await?;

    if !status.is_success() {
        return Err(format!("LLM request failed with status {}", status).into());
    }

    let completion: ChatCompletionResponse = serde_json::from_slice(&body)?;

    let title = completion
        .choices
        .first()
        .map(|choice| helpers::extract_message_text(&choice.message.content))
        .unwrap_or_default();

    Ok(title)
}

/// Save generated title to context
async fn save_title_to_context(
    context: &Arc<RwLock<context_manager::structs::context::ChatContext>>,
    title: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut ctx = context.write().await;
    ctx.title = Some(title.to_string());
    ctx.mark_dirty(); // Trigger auto-save
    Ok(())
}
