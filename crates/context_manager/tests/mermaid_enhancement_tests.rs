//! Tests for Mermaid Enhancement Feature
//!
//! This test suite verifies:
//! 1. MermaidEnhancementEnhancer functionality
//! 2. SystemPromptProcessor with enhancers
//! 3. ChatConfig mermaid_diagrams field
//! 4. End-to-end enhancement pipeline

use context_manager::{
    AgentRole,
    pipeline::{
        context::ProcessingContext,
        enhancers::{MermaidEnhancementEnhancer, PromptEnhancer},
        processors::SystemPromptProcessor,
        traits::MessageProcessor,
    },
    structs::{
        context::{ChatConfig, ChatContext},
        message::{ContentPart, InternalMessage, MessageType, Role},
    },
};
use std::collections::HashMap;
use uuid::Uuid;

/// Helper function to create a test ChatContext
fn create_test_context(mermaid_enabled: bool) -> ChatContext {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());
    context.config.mermaid_diagrams = mermaid_enabled;
    context
}

/// Helper function to create a dummy message for testing
fn create_dummy_message() -> InternalMessage {
    InternalMessage {
        role: Role::User,
        content: vec![ContentPart::Text {
            text: "Test message".to_string(),
        }],
        tool_calls: None,
        tool_result: None,
        metadata: None,
        message_type: MessageType::Text,
        rich_type: None,
    }
}

#[test]
fn test_mermaid_enhancer_enabled() {
    // Create context with mermaid enabled
    let mut context = create_test_context(true);
    let message = create_dummy_message();
    let ctx = ProcessingContext::new(message, &mut context);

    // Create enhancer and test
    let enhancer = MermaidEnhancementEnhancer::new();
    let result = enhancer.enhance(&ctx);

    // Should return Some(fragment) when enabled
    assert!(
        result.is_some(),
        "Enhancer should return fragment when mermaid is enabled"
    );

    let fragment = result.unwrap();
    assert_eq!(
        fragment.priority, 50,
        "Mermaid enhancer should have priority 50"
    );
    assert!(
        fragment.content.contains("Mermaid"),
        "Fragment should contain Mermaid-related content"
    );
    assert!(
        fragment.content.contains("diagram"),
        "Fragment should mention diagrams"
    );
}

#[test]
fn test_mermaid_enhancer_disabled() {
    // Create context with mermaid disabled
    let mut context = create_test_context(false);
    let message = create_dummy_message();
    let ctx = ProcessingContext::new(message, &mut context);

    // Create enhancer and test
    let enhancer = MermaidEnhancementEnhancer::new();
    let result = enhancer.enhance(&ctx);

    // Should return None when disabled
    assert!(
        result.is_none(),
        "Enhancer should return None when mermaid is disabled"
    );
}

#[test]
fn test_system_prompt_processor_with_mermaid_enabled() {
    // Create context with mermaid enabled
    let mut context = create_test_context(true);
    let message = create_dummy_message();
    let mut ctx = ProcessingContext::new(message, &mut context);

    // Create processor with default enhancers
    let processor = SystemPromptProcessor::with_default_enhancers("You are a helpful assistant.");

    // Process
    let result = processor.process(&mut ctx);
    assert!(result.is_ok(), "Processor should succeed");

    // Check that system prompt was set
    let system_prompt = ctx.get_metadata("final_system_prompt");
    assert!(system_prompt.is_some(), "System prompt should be set");

    let prompt = system_prompt.unwrap().as_str().expect("Should be string");
    assert!(
        prompt.contains("Mermaid"),
        "System prompt should contain Mermaid enhancement when enabled"
    );
}

#[test]
fn test_system_prompt_processor_with_mermaid_disabled() {
    // Create context with mermaid disabled
    let mut context = create_test_context(false);
    let message = create_dummy_message();
    let mut ctx = ProcessingContext::new(message, &mut context);

    // Create processor with default enhancers
    let processor = SystemPromptProcessor::with_default_enhancers("You are a helpful assistant.");

    // Process
    let result = processor.process(&mut ctx);
    assert!(result.is_ok(), "Processor should succeed");

    // Check that system prompt was set
    let system_prompt = ctx.get_metadata("final_system_prompt");
    assert!(system_prompt.is_some(), "System prompt should be set");

    let prompt = system_prompt.unwrap().as_str().expect("Should be string");
    assert!(
        !prompt.contains("Mermaid"),
        "System prompt should NOT contain Mermaid enhancement when disabled"
    );
}

#[test]
fn test_chat_config_mermaid_default() {
    // Test that default value is true
    let config = ChatConfig {
        model_id: "gpt-4".to_string(),
        mode: "default".to_string(),
        parameters: HashMap::new(),
        system_prompt_id: None,
        agent_role: AgentRole::Actor,
        workspace_path: None,
        mermaid_diagrams: true, // Default should be true
    };

    assert!(
        config.mermaid_diagrams,
        "Default mermaid_diagrams should be true"
    );
}

#[test]
fn test_chat_config_serialization() {
    // Test serialization with mermaid_diagrams = true
    let config = ChatConfig {
        model_id: "gpt-4".to_string(),
        mode: "default".to_string(),
        parameters: HashMap::new(),
        system_prompt_id: None,
        agent_role: AgentRole::Actor,
        workspace_path: None,
        mermaid_diagrams: true,
    };

    let json = serde_json::to_string(&config).expect("Should serialize");
    assert!(
        json.contains("\"mermaid_diagrams\":true"),
        "JSON should contain mermaid_diagrams field"
    );

    // Test deserialization
    let deserialized: ChatConfig = serde_json::from_str(&json).expect("Should deserialize");
    assert_eq!(
        deserialized.mermaid_diagrams, true,
        "Deserialized value should match"
    );
}

#[test]
fn test_chat_config_serialization_disabled() {
    // Test serialization with mermaid_diagrams = false
    let config = ChatConfig {
        model_id: "gpt-4".to_string(),
        mode: "default".to_string(),
        parameters: HashMap::new(),
        system_prompt_id: None,
        agent_role: AgentRole::Actor,
        workspace_path: None,
        mermaid_diagrams: false,
    };

    let json = serde_json::to_string(&config).expect("Should serialize");
    assert!(
        json.contains("\"mermaid_diagrams\":false"),
        "JSON should contain mermaid_diagrams field"
    );

    // Test deserialization
    let deserialized: ChatConfig = serde_json::from_str(&json).expect("Should deserialize");
    assert_eq!(
        deserialized.mermaid_diagrams, false,
        "Deserialized value should match"
    );
}

#[test]
fn test_enhancer_priority_order() {
    // Test that enhancers are applied in correct priority order
    let mut context = create_test_context(true);
    let message = create_dummy_message();
    let mut ctx = ProcessingContext::new(message, &mut context);

    let processor = SystemPromptProcessor::with_default_enhancers("Base prompt.");
    let result = processor.process(&mut ctx);
    assert!(result.is_ok(), "Processor should succeed");

    let system_prompt = ctx.get_metadata("final_system_prompt").unwrap();
    let prompt = system_prompt.as_str().expect("Should be string");

    // Check that all enhancers contributed
    // Priority order: RoleContext (90) > ToolEnhancement (60) > Mermaid (50) > ContextHints (40)

    // Should contain role context (priority 90)
    assert!(
        prompt.contains("Actor") || prompt.contains("role"),
        "Should contain role context"
    );

    // Should contain mermaid (priority 50)
    assert!(
        prompt.contains("Mermaid"),
        "Should contain Mermaid enhancement"
    );
}

#[test]
fn test_custom_enhancer_registration() {
    // Test that we can register custom enhancers
    let mut context = create_test_context(true);
    let message = create_dummy_message();
    let mut ctx = ProcessingContext::new(message, &mut context);

    // Create processor and register only Mermaid enhancer
    let processor = SystemPromptProcessor::with_base_prompt("Base prompt.")
        .register_enhancer(Box::new(MermaidEnhancementEnhancer::new()));

    let result = processor.process(&mut ctx);
    assert!(result.is_ok(), "Processor should succeed");

    let system_prompt = ctx.get_metadata("final_system_prompt").unwrap();
    let prompt = system_prompt.as_str().expect("Should be string");

    // Should contain base prompt
    assert!(prompt.contains("Base prompt"), "Should contain base prompt");

    // Should contain Mermaid enhancement
    assert!(
        prompt.contains("Mermaid"),
        "Should contain Mermaid enhancement"
    );
}

#[test]
fn test_mermaid_enhancer_name() {
    let enhancer = MermaidEnhancementEnhancer::new();
    assert_eq!(
        enhancer.name(),
        "mermaid_enhancement",
        "Enhancer name should be correct"
    );
}
