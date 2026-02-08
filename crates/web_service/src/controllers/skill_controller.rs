use actix_web::{get, web, HttpResponse};
use agent_server::state::AppState as AgentAppState;
use agent_skill::{SkillDefinition, SkillFilter};
use agent_tools::BuiltinToolExecutor;
use log::{debug, info};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::AppError;

/// Configure skill routes
pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(list_skills)
        .service(get_skill)
        .service(get_available_tools)
        .service(get_filtered_tools)
        .service(get_available_workflows);
}

#[derive(Serialize)]
struct SkillListResponse {
    skills: Vec<SkillDefinition>,
    total: usize,
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
struct FilteredToolsResponse {
    tools: Vec<OpenAiTool>,
}

#[derive(Serialize)]
struct OpenAiTool {
    #[serde(rename = "type")]
    tool_type: String,
    function: OpenAiFunction,
}

#[derive(Serialize)]
struct OpenAiFunction {
    name: String,
    description: String,
    parameters: Value,
}

#[derive(Serialize)]
struct AvailableWorkflowsResponse {
    workflows: Vec<String>,
}

/// GET /v1/skills - List all skills
#[get("/v1/skills")]
pub async fn list_skills(
    agent_state: web::Data<AgentAppState>,
    query: web::Query<ListSkillsQuery>,
) -> Result<HttpResponse, AppError> {
    let mut filter = SkillFilter::new();
    if let Some(category) = query.category.clone() {
        filter = filter.with_category(category);
    }
    if let Some(search) = query.search.clone() {
        filter = filter.with_search(search);
    }
    if query.enabled_only.unwrap_or(false) {
        filter = filter.enabled_only();
    }

    let skills = agent_state
        .skill_manager
        .as_ref()
        .store()
        .list_skills(Some(filter))
        .await;

    Ok(HttpResponse::Ok().json(SkillListResponse {
        total: skills.len(),
        skills,
    }))
}

/// GET /v1/skills/{id} - Get skill detail
#[get("/v1/skills/{id}")]
pub async fn get_skill(
    agent_state: web::Data<AgentAppState>,
    path: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let id = path.into_inner();
    let skill = agent_state
        .skill_manager
        .as_ref()
        .store()
        .get_skill(&id)
        .await
        .map_err(|_| AppError::NotFound(format!("Skill {} not found", id)))?;

    Ok(HttpResponse::Ok().json(skill))
}

/// GET /v1/skills/available-tools - Get available built-in tools
#[get("/v1/skills/available-tools")]
pub async fn get_available_tools(
    _agent_state: web::Data<AgentAppState>,
) -> Result<HttpResponse, AppError> {
    let tool_names: Vec<String> = BuiltinToolExecutor::tool_schemas()
        .into_iter()
        .map(|tool| tool.function.name)
        .collect();

    Ok(HttpResponse::Ok().json(AvailableToolsResponse { tools: tool_names }))
}

#[derive(Deserialize)]
struct FilteredToolsQuery {
    chat_id: Option<String>,
}

/// GET /v1/skills/filtered-tools - Get tools filtered by enabled skills
#[get("/v1/skills/filtered-tools")]
pub async fn get_filtered_tools(
    agent_state: web::Data<AgentAppState>,
    query: web::Query<FilteredToolsQuery>,
) -> Result<HttpResponse, AppError> {
    let allowed_tools = agent_state
        .skill_manager
        .as_ref()
        .get_allowed_tools(query.chat_id.as_deref())
        .await;
    debug!("Skill filtered tools allowed list: {:?}", allowed_tools);

    let all_tools = BuiltinToolExecutor::tool_schemas();
    let all_tool_names: Vec<String> = all_tools
        .iter()
        .map(|tool| tool.function.name.clone())
        .collect();
    debug!("Built-in tools discovered: {:?}", all_tool_names);

    let filtered = if allowed_tools.is_empty() {
        info!("No enabled skills; returning all {} tools", all_tools.len());
        all_tools
    } else {
        let filtered: Vec<_> = all_tools
            .into_iter()
            .filter(|tool| {
                allowed_tools
                    .iter()
                    .any(|allowed| allowed == &tool.function.name)
            })
            .collect();
        info!(
            "Filtered tools: allowed={}, matched={}",
            allowed_tools.len(),
            filtered.len()
        );
        filtered
    };

    let tools = filtered
        .into_iter()
        .map(|tool| OpenAiTool {
            tool_type: "function".to_string(),
            function: OpenAiFunction {
                name: tool.function.name,
                description: tool.function.description,
                parameters: tool.function.parameters,
            },
        })
        .collect();

    Ok(HttpResponse::Ok().json(FilteredToolsResponse { tools }))
}

/// GET /v1/skills/available-workflows - Get available workflows
#[get("/v1/skills/available-workflows")]
pub async fn get_available_workflows(
    _agent_state: web::Data<AgentAppState>,
) -> Result<HttpResponse, AppError> {
    let workflows = crate::services::skill_service::list_workflows()
        .await
        .map_err(|e| AppError::InternalError(anyhow::anyhow!("Failed to list workflows: {}", e)))?;

    Ok(HttpResponse::Ok().json(AvailableWorkflowsResponse { workflows }))
}
