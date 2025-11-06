use context_manager::{
    ChatContext, ContextError, ContextState, IncomingMessage, MessagePipeline, MessageUpdate, Role,
};
use futures::{StreamExt, executor::block_on};
use uuid::Uuid;

#[test]
fn test_pipeline_text_message_produces_updates() {
    let pipeline = MessagePipeline::with_default_processors();
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());
    let incoming = IncomingMessage::text("Hello pipeline");

    let stream = pipeline
        .process(&mut context, &incoming)
        .expect("pipeline should succeed");
    let updates: Vec<_> = block_on(stream.collect());

    assert!(!updates.is_empty());
    assert_eq!(
        updates[0].current_state,
        ContextState::ProcessingUserMessage
    );

    let created = updates
        .iter()
        .find_map(|update| match &update.message_update {
            Some(MessageUpdate::Created { role, .. }) if role == &Role::User => Some(()),
            _ => None,
        });
    assert!(created.is_some(), "expected user message to be created");
}

#[test]
fn test_pipeline_rejects_empty_messages() {
    let pipeline = MessagePipeline::with_default_processors();
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());
    let incoming = IncomingMessage::text("   ");

    let result = pipeline.process(&mut context, &incoming);
    assert!(matches!(result, Err(ContextError::EmptyMessageContent)));
}
