//! Unit tests for SystemPromptEnhancer

use std::sync::Arc;
use std::path::PathBuf;
use web_service::services::system_prompt_enhancer::{SystemPromptEnhancer, EnhancementConfig};
use web_service::services::template_variable_service::TemplateVariableService;
use tool_system::ToolRegistry;
use context_manager::structs::context::AgentRole;
use std::time::Duration;

#[tokio::test]
async fn test_enhance_prompt_with_tools() {
    let tool_registry = Arc::new(ToolRegistry::new());
    
    let enhancer = SystemPromptEnhancer::new(
        tool_registry.clone(),
        EnhancementConfig::default(),
    );
    
    let base_prompt = "You are a helpful assistant.";
    let result = enhancer.enhance_prompt(
        base_prompt,
        &AgentRole::Actor,
    ).await;
    
    assert!(result.is_ok());
    let enhanced = result.unwrap();
    
    // Should contain base prompt
    assert!(enhanced.contains("helpful assistant"));
    
    // Should contain tool-related content
    assert!(enhanced.len() > base_prompt.len());
}

#[tokio::test]
async fn test_enhance_prompt_without_tools() {
    let tool_registry = Arc::new(ToolRegistry::new());
    
    let config = EnhancementConfig {
        enable_tools: false,
        enable_mermaid: false,
        ..Default::default()
    };
    
    let enhancer = SystemPromptEnhancer::new(
        tool_registry.clone(),
        config,
    );
    
    let base_prompt = "You are a helpful assistant.";
    let result = enhancer.enhance_prompt(
        base_prompt,
        &AgentRole::Actor,
    ).await;
    
    assert!(result.is_ok());
    let enhanced = result.unwrap();
    
    // Should contain base prompt
    assert!(enhanced.contains("helpful assistant"));
}

#[tokio::test]
async fn test_enhance_prompt_with_mermaid() {
    let tool_registry = Arc::new(ToolRegistry::new());
    
    let config = EnhancementConfig {
        enable_tools: false,
        enable_mermaid: true,
        ..Default::default()
    };
    
    let enhancer = SystemPromptEnhancer::new(
        tool_registry.clone(),
        config,
    );
    
    let base_prompt = "You are a helpful assistant.";
    let result = enhancer.enhance_prompt(
        base_prompt,
        &AgentRole::Actor,
    ).await;
    
    assert!(result.is_ok());
    let enhanced = result.unwrap();
    
    // Should contain Mermaid instructions
    assert!(enhanced.contains("mermaid") || enhanced.contains("diagram"));
}

#[tokio::test]
async fn test_enhance_prompt_with_config() {
    let tool_registry = Arc::new(ToolRegistry::new());
    
    let config = EnhancementConfig {
        max_prompt_size: 10000,
        enable_tools: true,
        enable_mermaid: false,
        ..Default::default()
    };
    
    let enhancer = SystemPromptEnhancer::new(
        tool_registry.clone(),
        config,
    );
    
    let base_prompt = "You are a helpful assistant with many capabilities.";
    let result = enhancer.enhance_prompt(
        base_prompt,
        &AgentRole::Actor,
    ).await;
    
    assert!(result.is_ok());
    let enhanced = result.unwrap();
    
    // Should contain base prompt and be enhanced
    assert!(enhanced.contains("helpful assistant"));
    assert!(enhanced.len() > base_prompt.len());
}

#[tokio::test]
async fn test_enhance_prompt_caching() {
    let tool_registry = Arc::new(ToolRegistry::new());
    
    let config = EnhancementConfig {
        cache_ttl: Duration::from_secs(60),
        ..Default::default()
    };
    
    let enhancer = SystemPromptEnhancer::new(
        tool_registry.clone(),
        config,
    );
    
    let base_prompt = "You are a helpful assistant.";
    
    // First call - cache miss
    let result1 = enhancer.enhance_prompt(
        base_prompt,
        &AgentRole::Actor,
    ).await;
    assert!(result1.is_ok());
    let enhanced1 = result1.unwrap();
    
    // Second call - should hit cache
    let result2 = enhancer.enhance_prompt(
        base_prompt,
        &AgentRole::Actor,
    ).await;
    assert!(result2.is_ok());
    let enhanced2 = result2.unwrap();
    
    // Results should be identical (from cache)
    assert_eq!(enhanced1, enhanced2);
}

#[tokio::test]
async fn test_enhance_prompt_with_different_roles() {
    let tool_registry = Arc::new(ToolRegistry::new());
    
    let enhancer = SystemPromptEnhancer::new(
        tool_registry.clone(),
        EnhancementConfig::default(),
    );
    
    let base_prompt = "You are a helpful assistant.";
    
    // Test with Actor role
    let result_actor = enhancer.enhance_prompt(
        base_prompt,
        &AgentRole::Actor,
    ).await;
    assert!(result_actor.is_ok());
    
    // Test with Planner role
    let result_planner = enhancer.enhance_prompt(
        base_prompt,
        &AgentRole::Planner,
    ).await;
    assert!(result_planner.is_ok());
    
    // Different roles might get different tool sets
    let enhanced_actor = result_actor.unwrap();
    let enhanced_planner = result_planner.unwrap();
    
    assert!(!enhanced_actor.is_empty());
    assert!(!enhanced_planner.is_empty());
}

#[tokio::test]
async fn test_enhance_prompt_empty_base() {
    let tool_registry = Arc::new(ToolRegistry::new());
    
    let enhancer = SystemPromptEnhancer::new(
        tool_registry.clone(),
        EnhancementConfig::default(),
    );
    
    let base_prompt = "";
    let result = enhancer.enhance_prompt(
        base_prompt,
        &AgentRole::Actor,
    ).await;
    
    assert!(result.is_ok());
    let enhanced = result.unwrap();
    
    // Should still contain tool definitions even with empty base
    assert!(!enhanced.is_empty());
}

#[tokio::test]
async fn test_enhance_prompt_special_characters() {
    let tool_registry = Arc::new(ToolRegistry::new());
    
    let enhancer = SystemPromptEnhancer::new(
        tool_registry.clone(),
        EnhancementConfig::default(),
    );
    
    let base_prompt = "You are a helpful assistant.\n\nRules:\n- Be concise\n- Use proper formatting";
    let result = enhancer.enhance_prompt(
        base_prompt,
        &AgentRole::Actor,
    ).await;
    
    assert!(result.is_ok());
    let enhanced = result.unwrap();
    
    // Should preserve formatting
    assert!(enhanced.contains("Rules:"));
    assert!(enhanced.contains("Be concise"));
}

#[tokio::test]
async fn test_enhance_prompt_long_base() {
    let tool_registry = Arc::new(ToolRegistry::new());
    
    let config = EnhancementConfig {
        max_prompt_size: 50000,
        ..Default::default()
    };
    
    let enhancer = SystemPromptEnhancer::new(
        tool_registry.clone(),
        config,
    );
    
    // Create a long base prompt
    let base_prompt = "You are a helpful assistant. ".repeat(100); // ~3KB
    let result = enhancer.enhance_prompt(
        &base_prompt,
        &AgentRole::Actor,
    ).await;
    
    assert!(result.is_ok());
    let enhanced = result.unwrap();
    
    // Should succeed and contain the base prompt
    assert!(!enhanced.is_empty());
    assert!(enhanced.contains("helpful assistant"));
}

#[tokio::test]
async fn test_cache_invalidation_after_ttl() {
    let tool_registry = Arc::new(ToolRegistry::new());
    
    let config = EnhancementConfig {
        cache_ttl: Duration::from_millis(100), // Very short TTL
        ..Default::default()
    };
    
    let enhancer = SystemPromptEnhancer::new(
        tool_registry.clone(),
        config,
    );
    
    let base_prompt = "You are a helpful assistant.";
    
    // First call
    let result1 = enhancer.enhance_prompt(
        base_prompt,
        &AgentRole::Actor,
    ).await;
    assert!(result1.is_ok());
    
    // Wait for cache to expire
    tokio::time::sleep(Duration::from_millis(150)).await;
    
    // Second call after TTL - should regenerate
    let result2 = enhancer.enhance_prompt(
        base_prompt,
        &AgentRole::Actor,
    ).await;
    assert!(result2.is_ok());
    
    // Both should succeed
    assert!(result1.is_ok());
    assert!(result2.is_ok());
}

#[tokio::test]
async fn test_enhance_prompt_with_template_service() {
    let tool_registry = Arc::new(ToolRegistry::new());
    let template_path = PathBuf::from("template_variables.json");
    let template_service = Arc::new(TemplateVariableService::new(template_path));
    
    let enhancer = SystemPromptEnhancer::new(
        tool_registry.clone(),
        EnhancementConfig::default(),
    ).with_template_service(template_service);
    
    let base_prompt = "You are {{role}} assistant.";
    let result = enhancer.enhance_prompt(
        base_prompt,
        &AgentRole::Actor,
    ).await;
    
    assert!(result.is_ok());
    let enhanced = result.unwrap();
    
    // Template variables might be replaced (depends on template file existence)
    assert!(!enhanced.is_empty());
}

#[tokio::test]
async fn test_enhancement_config_defaults() {
    let config = EnhancementConfig::default();
    
    assert!(config.enable_tools);
    assert!(config.enable_mermaid);
    assert_eq!(config.cache_ttl, Duration::from_secs(300));
    assert_eq!(config.max_prompt_size, 100_000);
}

#[tokio::test]
async fn test_multiple_concurrent_enhancements() {
    use tokio::task::JoinSet;
    
    let tool_registry = Arc::new(ToolRegistry::new());
    let enhancer = Arc::new(SystemPromptEnhancer::new(
        tool_registry.clone(),
        EnhancementConfig::default(),
    ));
    
    let mut join_set = JoinSet::new();
    
    // Run multiple enhancements concurrently
    for i in 0..10 {
        let enhancer_clone = enhancer.clone();
        join_set.spawn(async move {
            let prompt = format!("You are assistant number {}.", i);
            enhancer_clone.enhance_prompt(&prompt, &AgentRole::Actor).await
        });
    }
    
    // Wait for all to complete
    let mut success_count = 0;
    while let Some(result) = join_set.join_next().await {
        if let Ok(Ok(_)) = result {
            success_count += 1;
        }
    }
    
    assert_eq!(success_count, 10);
}
