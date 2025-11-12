use std::sync::Arc;

use context_manager::{ChatContext, IncomingMessage, SystemPrompt};
use copilot_client::api::models::{Content, Role as ClientRole};
use futures_util::StreamExt;
use tempfile::tempdir;
use tokio::sync::RwLock;

use uuid::Uuid;

use web_service::services::llm_request_builder::LlmRequestBuilder;

use web_service::services::system_prompt_service::SystemPromptService;

fn create_context() -> Arc<RwLock<ChatContext>> {
    Arc::new(RwLock::new(ChatContext::new(
        Uuid::new_v4(),
        "gpt-test".to_string(),
        "default".to_string(),
    )))
}

#[tokio::test]
async fn test_builder_injects_system_prompt_from_service() {
    let temp_dir = tempdir().expect("temp dir");
    let prompt_service = Arc::new(SystemPromptService::new(temp_dir.path().to_path_buf()));
    let prompt = SystemPrompt {
        id: "custom_prompt".to_string(),
        content: "You are a custom assistant".to_string(),
    };
    prompt_service
        .create_prompt(prompt.clone())
        .await
        .expect("create prompt");

    let builder = LlmRequestBuilder::new(prompt_service.clone());

    let context = create_context();
    {
        let mut ctx = context.write().await;
        ctx.config.system_prompt_id = Some(prompt.id.clone());
    }

    let updates = {
        let mut ctx = context.write().await;
        ctx.send_message(IncomingMessage::text("hello builder"))
            .expect("send message")
    };
    updates.collect::<Vec<_>>().await;

    let built = builder.build(&context).await.expect("build request");

    assert_eq!(built.prepared.messages.len(), 1);
    assert_eq!(built.request.messages.len(), 2); // system prompt + user message
    assert_eq!(built.request.messages[0].role, ClientRole::System);
    if let Content::Text(text) = &built.request.messages[0].content {
        assert!(text.contains("custom assistant"));
    } else {
        panic!("Expected system message to be text");
    }
    assert_eq!(built.request.messages[1].role, ClientRole::User);
}

#[tokio::test]
async fn test_builder_prefers_branch_prompt() {
    let temp_dir = tempdir().expect("temp dir");
    let prompt_service = Arc::new(SystemPromptService::new(temp_dir.path().to_path_buf()));
    let builder = LlmRequestBuilder::new(prompt_service);

    let context = create_context();
    {
        let mut ctx = context.write().await;
        ctx.set_active_branch_system_prompt(SystemPrompt {
            id: "branch_prompt".to_string(),
            content: "Branch-specific prompt".to_string(),
        });
    }

    let updates = {
        let mut ctx = context.write().await;
        ctx.send_message(IncomingMessage::text("message on branch"))
            .expect("send message")
    };
    updates.collect::<Vec<_>>().await;

    let built = builder.build(&context).await.expect("build request");

    assert_eq!(
        built
            .prepared
            .branch_system_prompt
            .as_ref()
            .expect("branch prompt")
            .id,
        "branch_prompt"
    );
    assert_eq!(built.request.messages.len(), 2);
    if let Content::Text(text) = &built.request.messages[0].content {
        assert!(text.contains("Branch-specific prompt"));
    } else {
        panic!("Expected system message to be text");
    }
}
