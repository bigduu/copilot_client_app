use crate::dto::SystemPromptDTO;
use crate::services::system_prompt_service::SystemPromptService;
use actix_web::{
    web::{Data, Json, Path},
    HttpResponse, Result,
};
use context_manager::{
    pipeline::{
        context::ProcessingContext, processors::system_prompt::SystemPromptProcessor,
        traits::MessageProcessor,
    },
    structs::{
        branch::SystemPrompt,
        message::{ContentPart, InternalMessage, MessageType, Role},
    },
};
use log::{error, info};
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Debug)]
pub struct CreateSystemPromptRequest {
    pub id: String,
    pub content: String,
}

#[derive(Serialize, Debug)]
pub struct ListSystemPromptsResponse {
    pub prompts: Vec<SystemPromptDTO>,
}

/// Create a new system prompt
pub async fn create_system_prompt(
    req: Json<CreateSystemPromptRequest>,
    service: Data<SystemPromptService>,
) -> Result<HttpResponse> {
    let prompt = SystemPrompt {
        id: req.id.clone(),
        content: req.content.clone(),
    };

    match service.create_prompt(prompt).await {
        Ok(_) => {
            info!("Created system prompt: {}", req.id);
            Ok(HttpResponse::Ok().json(serde_json::json!({
                "message": "System prompt created successfully",
                "id": req.id
            })))
        }
        Err(e) => {
            error!("Failed to create system prompt: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to create system prompt: {}", e)
            })))
        }
    }
}

/// Get all system prompts
pub async fn list_system_prompts(service: Data<SystemPromptService>) -> Result<HttpResponse> {
    let prompts = service.list_prompts().await;
    {
        let dtos: Vec<SystemPromptDTO> = prompts.into_iter().map(SystemPromptDTO::from).collect();

        Ok(HttpResponse::Ok().json(ListSystemPromptsResponse { prompts: dtos }))
    }
}

/// Get a specific system prompt by ID
pub async fn get_system_prompt(
    path: Path<String>,
    service: Data<SystemPromptService>,
) -> Result<HttpResponse> {
    let prompt_id = path.into_inner();

    match service.get_prompt(&prompt_id).await {
        Some(prompt) => Ok(HttpResponse::Ok().json(SystemPromptDTO::from(prompt))),
        None => {
            info!("System prompt not found: {}", prompt_id);
            Ok(HttpResponse::NotFound().json(serde_json::json!({
                "error": "System prompt not found"
            })))
        }
    }
}

/// Update a system prompt
pub async fn update_system_prompt(
    path: Path<String>,
    req: Json<serde_json::Value>,
    service: Data<SystemPromptService>,
) -> Result<HttpResponse> {
    let prompt_id = path.into_inner();

    let content = req
        .get("content")
        .and_then(|v| v.as_str())
        .ok_or_else(|| actix_web::error::ErrorBadRequest("Missing 'content' field"))?;

    match service.update_prompt(&prompt_id, content.to_string()).await {
        Ok(_) => {
            info!("Updated system prompt: {}", prompt_id);
            Ok(HttpResponse::Ok().json(serde_json::json!({
                "message": "System prompt updated successfully"
            })))
        }
        Err(e) => {
            error!("Failed to update system prompt: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to update system prompt: {}", e)
            })))
        }
    }
}

/// Delete a system prompt
pub async fn delete_system_prompt(
    path: Path<String>,
    service: Data<SystemPromptService>,
) -> Result<HttpResponse> {
    let prompt_id = path.into_inner();

    match service.delete_prompt(&prompt_id).await {
        Ok(_) => {
            info!("Deleted system prompt: {}", prompt_id);
            Ok(HttpResponse::Ok().json(serde_json::json!({
                "message": "System prompt deleted successfully"
            })))
        }
        Err(e) => {
            error!("Failed to delete system prompt: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to delete system prompt: {}", e)
            })))
        }
    }
}

/// Get enhanced system prompt (base + tools + mermaid)
///
/// This endpoint uses Pipeline processors to enhance the system prompt with:
/// - Role context (via RoleContextEnhancer)
/// - Tool definitions (via ToolEnhancementEnhancer)
/// - Mermaid diagram guidelines (via MermaidEnhancementEnhancer)
/// - Context hints (via ContextHintsEnhancer)
/// - Formatting and structure (via SystemPromptProcessor)
pub async fn get_enhanced_system_prompt(
    path: Path<String>,
    prompt_service: Data<SystemPromptService>,
) -> Result<HttpResponse> {
    let prompt_id = path.into_inner();

    // Get base prompt
    match prompt_service.get_prompt(&prompt_id).await {
        Some(prompt) => {
            // Create a dummy ChatContext for Pipeline processing
            // We need a context to run the processors, but we don't need a real one
            let mut dummy_context = context_manager::ChatContext::new(
                uuid::Uuid::new_v4(),
                "gpt-4".to_string(),
                "preview".to_string(),
            );

            // Create a dummy message for ProcessingContext
            let dummy_message = InternalMessage {
                role: Role::User,
                content: vec![ContentPart::text_owned("dummy".to_string())],
                message_type: MessageType::Text,
                ..Default::default()
            };

            // Create processing context
            let mut ctx = ProcessingContext::new(dummy_message, &mut dummy_context);

            // Run SystemPromptProcessor with default enhancers
            // This will automatically run all enhancers:
            // - RoleContextEnhancer
            // - ToolEnhancementEnhancer
            // - MermaidEnhancementEnhancer
            // - ContextHintsEnhancer
            let system_prompt_processor =
                SystemPromptProcessor::with_default_enhancers(prompt.content.clone());
            match system_prompt_processor.process(&mut ctx) {
                Ok(_) => {
                    // Extract enhanced prompt from metadata
                    let enhanced_content = ctx
                        .get_metadata("final_system_prompt")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                        .unwrap_or(prompt.content.clone());

                    Ok(HttpResponse::Ok().json(serde_json::json!({
                        "id": prompt.id,
                        "content": enhanced_content,
                        "enhanced": true
                    })))
                }
                Err(e) => {
                    error!("Failed to enhance system prompt: {:?}", e);
                    Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                        "error": format!("Failed to enhance prompt: {:?}", e)
                    })))
                }
            }
        }
        None => {
            info!("System prompt not found: {}", prompt_id);
            Ok(HttpResponse::NotFound().json(serde_json::json!({
                "error": "System prompt not found"
            })))
        }
    }
}

pub fn config(cfg: &mut actix_web::web::ServiceConfig) {
    cfg.service(
        actix_web::web::scope("/system-prompts")
            .service(
                actix_web::web::resource("")
                    .route(actix_web::web::post().to(create_system_prompt))
                    .route(actix_web::web::get().to(list_system_prompts)),
            )
            .service(
                actix_web::web::resource("/{id}")
                    .route(actix_web::web::get().to(get_system_prompt))
                    .route(actix_web::web::put().to(update_system_prompt))
                    .route(actix_web::web::delete().to(delete_system_prompt)),
            )
            .service(
                actix_web::web::resource("/{id}/enhanced")
                    .route(actix_web::web::get().to(get_enhanced_system_prompt)),
            ),
    );
}
