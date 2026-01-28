use actix_web::{get, post, put, delete, web, HttpResponse};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::error::AppError;
use crate::server::AppState;
use skill_manager::{SkillDefinition, SkillFilter, SkillUpdate, SkillVisibility};

/// Configure skill routes
pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(list_skills)
        .service(get_skill)
        .service(create_skill)
        .service(update_skill)
        .service(delete_skill)
        .service(enable_skill)
        .service(disable_skill)
        .service(get_available_tools)
        .service(get_filtered_tools)
        .service(get_available_workflows);
}

#[derive(Serialize)]
struct SkillListResponse {
    skills: Vec<SkillDefinition>,
    total: usize,
}

#[derive(Serialize)]
struct SkillEnablementResponse {
    enabled_skill_ids: Vec<String>,
}

#[derive(Deserialize)]
struct CreateSkillRequest {
    id: Option<String>,
    name: String,
    description: String,
    category: String,
    #[serde(default)]
    tags: Vec<String>,
    prompt: String,
    #[serde(default)]
    tool_refs: Vec<String>,
    #[serde(default)]
    workflow_refs: Vec<String>,
    #[serde(default)]
    visibility: Option<SkillVisibility>,
    #[serde(default)]
    enabled_by_default: bool,
}

#[derive(Deserialize)]
struct UpdateSkillRequest {
    name: Option<String>,
    description: Option<String>,
    category: Option<String>,
    #[serde(default)]
    tags: Option<Vec<String>>,
    prompt: Option<String>,
    #[serde(default)]
    tool_refs: Option<Vec<String>>,
    #[serde(default)]
    workflow_refs: Option<Vec<String>>,
    visibility: Option<SkillVisibility>,
    enabled_by_default: Option<bool>,
}

#[derive(Deserialize)]
struct EnableSkillRequest {
    chat_id: Option<String>,
}

#[derive(Deserialize)]
struct ListSkillsQuery {
    category: Option<String>,
    search: Option<String>,
    enabled_only: Option<bool>,
}

#[derive(Serialize)]
struct AvailableToolsResponse {
    tools: Vec<String>,
}

#[derive(Serialize)]
struct AvailableWorkflowsResponse {
    workflows: Vec<String>,
}

/// GET /v1/skills - List all skills
#[get("/v1/skills")]
pub async fn list_skills(
    app_state: web::Data<AppState>,
    query: web::Query<ListSkillsQuery>,
) -> Result<HttpResponse, AppError> {
    let filter = SkillFilter::new()
        .with_optional_category(query.category.clone())
        .with_optional_search(query.search.clone())
        .with_enabled_only(query.enabled_only.unwrap_or(false));

    let skills = app_state.skill_manager.store().list_skills(Some(filter)).await;

    Ok(HttpResponse::Ok().json(SkillListResponse {
        total: skills.len(),
        skills,
    }))
}

/// GET /v1/skills/{id} - Get skill detail
#[get("/v1/skills/{id}")]
pub async fn get_skill(
    app_state: web::Data<AppState>,
    path: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let id = path.into_inner();
    let skill = app_state
        .skill_manager
        .store()
        .get_skill(&id)
        .await
        .map_err(|e| AppError::NotFound(format!("Skill '{}' not found", id)))?;

    Ok(HttpResponse::Ok().json(skill))
}

/// POST /v1/skills - Create a new skill
#[post("/v1/skills")]
pub async fn create_skill(
    app_state: web::Data<AppState>,
    request: web::Json<CreateSkillRequest>,
) -> Result<HttpResponse, AppError> {
    let req = request.into_inner();

    // Generate ID from name if not provided
    let id = req.id.unwrap_or_else(|| generate_id_from_name(&req.name));

    let skill = SkillDefinition::new(
        id,
        req.name,
        req.description,
        req.category,
        req.prompt,
    )
    .with_tags(req.tags)
    .with_tool_refs(req.tool_refs)
    .with_workflow_refs(req.workflow_refs)
    .with_visibility(req.visibility.unwrap_or(SkillVisibility::Public))
    .with_enabled_by_default(req.enabled_by_default);

    let created = app_state
        .skill_manager
        .store()
        .create_skill(skill)
        .await
        .map_err(|e| AppError::InternalError(anyhow::anyhow!("Failed to create skill: {}", e)))?;

    Ok(HttpResponse::Created().json(created))
}

/// PUT /v1/skills/{id} - Update a skill
#[put("/v1/skills/{id}")]
pub async fn update_skill(
    app_state: web::Data<AppState>,
    path: web::Path<String>,
    request: web::Json<UpdateSkillRequest>,
) -> Result<HttpResponse, AppError> {
    let id = path.into_inner();
    let req = request.into_inner();

    let mut update = SkillUpdate::new();

    if let Some(name) = req.name {
        update = update.with_name(name);
    }
    if let Some(description) = req.description {
        update = update.with_description(description);
    }
    if let Some(category) = req.category {
        update = update.with_category(category);
    }
    if let Some(tags) = req.tags {
        update = update.with_tags(tags);
    }
    if let Some(prompt) = req.prompt {
        update = update.with_prompt(prompt);
    }
    if let Some(tool_refs) = req.tool_refs {
        update = update.with_tool_refs(tool_refs);
    }
    if let Some(workflow_refs) = req.workflow_refs {
        update = update.with_workflow_refs(workflow_refs);
    }
    if let Some(visibility) = req.visibility {
        update = update.with_visibility(visibility);
    }
    if let Some(enabled) = req.enabled_by_default {
        update = update.with_enabled_by_default(enabled);
    }

    let updated = app_state
        .skill_manager
        .store()
        .update_skill(&id, update)
        .await
        .map_err(|e| match e {
            skill_manager::SkillError::NotFound(_) => {
                AppError::NotFound(format!("Skill '{}' not found", id))
            }
            _ => AppError::InternalError(anyhow::anyhow!("Failed to update skill: {}", e)),
        })?;

    Ok(HttpResponse::Ok().json(updated))
}

/// DELETE /v1/skills/{id} - Delete a skill
#[delete("/v1/skills/{id}")]
pub async fn delete_skill(
    app_state: web::Data<AppState>,
    path: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let id = path.into_inner();

    app_state
        .skill_manager
        .store()
        .delete_skill(&id)
        .await
        .map_err(|e| match e {
            skill_manager::SkillError::NotFound(_) => {
                AppError::NotFound(format!("Skill '{}' not found", id))
            }
            _ => AppError::InternalError(anyhow::anyhow!("Failed to delete skill: {}", e)),
        })?;

    Ok(HttpResponse::NoContent().finish())
}

/// POST /v1/skills/{id}/enable - Enable a skill
#[post("/v1/skills/{id}/enable")]
pub async fn enable_skill(
    app_state: web::Data<AppState>,
    path: web::Path<String>,
    request: Option<web::Json<EnableSkillRequest>>,
) -> Result<HttpResponse, AppError> {
    let id = path.into_inner();
    let chat_id = request.map(|r| r.chat_id.clone()).flatten();

    if let Some(chat_id) = chat_id {
        app_state
            .skill_manager
            .store()
            .enable_skill_for_chat(&id, &chat_id)
            .await
            .map_err(|e| AppError::InternalError(anyhow::anyhow!("Failed to enable skill: {}", e)))?;
    } else {
        app_state
            .skill_manager
            .store()
            .enable_skill_global(&id)
            .await
            .map_err(|e| AppError::InternalError(anyhow::anyhow!("Failed to enable skill: {}", e)))?;
    }

    Ok(HttpResponse::Ok().json(SkillEnablementResponse {
        enabled_skill_ids: app_state
            .skill_manager
            .store()
            .get_enablement()
            .await
            .enabled_skill_ids,
    }))
}

/// POST /v1/skills/{id}/disable - Disable a skill
#[post("/v1/skills/{id}/disable")]
pub async fn disable_skill(
    app_state: web::Data<AppState>,
    path: web::Path<String>,
    request: Option<web::Json<EnableSkillRequest>>,
) -> Result<HttpResponse, AppError> {
    let id = path.into_inner();
    let chat_id = request.map(|r| r.chat_id.clone()).flatten();

    if let Some(chat_id) = chat_id {
        app_state
            .skill_manager
            .store()
            .disable_skill_for_chat(&id, &chat_id)
            .await;
    } else {
        app_state
            .skill_manager
            .store()
            .disable_skill_global(&id)
            .await;
    }

    Ok(HttpResponse::Ok().json(SkillEnablementResponse {
        enabled_skill_ids: app_state
            .skill_manager
            .store()
            .get_enablement()
            .await
            .enabled_skill_ids,
    }))
}

/// GET /v1/skills/available-tools - Get available MCP tools
#[get("/v1/skills/available-tools")]
pub async fn get_available_tools(
    app_state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    // Get tools from MCP runtime
    let tools = app_state
        .mcp_runtime
        .list_tools()
        .await
        .map_err(|e| AppError::InternalError(anyhow::anyhow!("Failed to list tools: {}", e)))?;

    let tool_names: Vec<String> = tools.into_iter().map(|(_, tool)| tool.name.to_string()).collect();

    Ok(HttpResponse::Ok().json(AvailableToolsResponse { tools: tool_names }))
}

#[derive(Deserialize)]
struct FilteredToolsQuery {
    chat_id: Option<String>,
}

/// GET /v1/skills/filtered-tools - Get tools filtered by enabled skills
#[get("/v1/skills/filtered-tools")]
pub async fn get_filtered_tools(
    app_state: web::Data<AppState>,
    query: web::Query<FilteredToolsQuery>,
) -> Result<HttpResponse, AppError> {
    // Get allowed tools from skill manager
    let allowed_tools = app_state
        .skill_manager
        .get_allowed_tools(query.chat_id.as_deref())
        .await;

    // If no skills enabled, return all tools
    if allowed_tools.is_empty() {
        let tools = app_state
            .mcp_runtime
            .list_tools()
            .await
            .map_err(|e| AppError::InternalError(anyhow::anyhow!("Failed to list tools: {}", e)))?;
        let tool_names: Vec<String> = tools.into_iter().map(|(_, tool)| tool.name.to_string()).collect();
        return Ok(HttpResponse::Ok().json(AvailableToolsResponse { tools: tool_names }));
    }

    // Get all tools and filter
    let all_tools = app_state
        .mcp_runtime
        .list_tools()
        .await
        .map_err(|e| AppError::InternalError(anyhow::anyhow!("Failed to list tools: {}", e)))?;

    let filtered_tools: Vec<String> = all_tools
        .into_iter()
        .filter(|(_, tool)| {
            let tool_name = tool.name.to_string();
            // Check if tool is in allowed list (format: "server::tool")
            allowed_tools.iter().any(|allowed| {
                allowed.ends_with(&format!("::{}", tool_name)) || allowed == &tool_name
            })
        })
        .map(|(_, tool)| tool.name.to_string())
        .collect();

    Ok(HttpResponse::Ok().json(AvailableToolsResponse { tools: filtered_tools }))
}

/// GET /v1/skills/available-workflows - Get available workflows
#[get("/v1/skills/available-workflows")]
pub async fn get_available_workflows(
    app_state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    // Get workflows from bodhi directory
    let workflows = crate::services::skill_service::list_workflows().await
        .map_err(|e| AppError::InternalError(anyhow::anyhow!("Failed to list workflows: {}", e)))?;

    Ok(HttpResponse::Ok().json(AvailableWorkflowsResponse { workflows }))
}

/// Generate kebab-case ID from name
fn generate_id_from_name(name: &str) -> String {
    name.to_lowercase()
        .trim()
        .replace(|c: char| !c.is_alphanumeric(), "-")
        .replace("--", "-")
        .trim_matches('-')
        .to_string()
}

impl SkillFilter {
    fn with_optional_category(mut self, category: Option<String>) -> Self {
        if let Some(cat) = category {
            self.category = Some(cat);
        }
        self
    }

    fn with_optional_search(mut self, search: Option<String>) -> Self {
        if let Some(s) = search {
            self.search = Some(s);
        }
        self
    }

    fn with_enabled_only(mut self, enabled_only: bool) -> Self {
        self.enabled_only = enabled_only;
        self
    }
}
