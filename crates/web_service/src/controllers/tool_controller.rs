use crate::error::AppError;
use crate::models::ToolExecutionRequest;
use crate::services::tool_service::ToolService;
use actix_web::{web, HttpResponse, Responder};
use log::warn;

/// DEPRECATED: Direct tool execution endpoint
/// Tools are now LLM-driven and executed through the agent loop.
/// Use workflows for user-invoked actions instead.
/// This endpoint will be removed in a future version.
#[deprecated(
    since = "0.2.0",
    note = "Tools are now LLM-driven. Use workflows for user-invoked actions instead."
)]
async fn execute_tool(
    tool_service: web::Data<ToolService>,
    request: web::Json<ToolExecutionRequest>,
) -> Result<HttpResponse, AppError> {
    warn!(
        "DEPRECATED: /tools/execute called for tool '{}'. \
        This endpoint is deprecated. Use workflows for user-invoked actions.",
        request.tool_name
    );

    let result = tool_service.execute_tool(request.into_inner()).await?;
    Ok(HttpResponse::Ok()
        .insert_header(("X-Deprecated", "true"))
        .insert_header((
            "X-Deprecation-Message",
            "Use workflows for user-invoked actions",
        ))
        .json(result))
}

/// DEPRECATED: Tool categories endpoint
/// Categories now apply to workflows, not tools.
/// Use /v1/workflows/categories instead.
/// This endpoint will be removed in a future version.
#[deprecated(
    since = "0.2.0",
    note = "Use /v1/workflows/categories instead. Categories now apply to workflows."
)]
async fn get_categories(tool_service: web::Data<ToolService>) -> impl Responder {
    warn!("DEPRECATED: /tools/categories called. Use /v1/workflows/categories instead.");

    let categories = tool_service.get_categories();
    HttpResponse::Ok()
        .insert_header(("X-Deprecated", "true"))
        .insert_header((
            "X-Deprecation-Message",
            "Use /v1/workflows/categories instead",
        ))
        .json(categories)
}

/// DEPRECATED: Category info endpoint for tools
/// This endpoint will be removed in a future version.
#[deprecated(
    since = "0.2.0",
    note = "Tool categories are deprecated. Use workflow categories instead."
)]
async fn get_category_info(
    tool_service: web::Data<ToolService>,
    path: web::Path<String>,
) -> impl Responder {
    let category_id = path.into_inner();
    warn!(
        "DEPRECATED: /tools/category/{}/info called. Tool categories are deprecated.",
        category_id
    );

    match tool_service.get_category(&category_id) {
        Some(info) => HttpResponse::Ok()
            .insert_header(("X-Deprecated", "true"))
            .json(info),
        None => HttpResponse::NotFound().json(serde_json::json!({
            "error": "Category not found"
        })),
    }
}

pub fn config(cfg: &mut web::ServiceConfig) {
    // ==================================================================================
    // DEPRECATION NOTICE - ALL ENDPOINTS IN THIS MODULE ARE DEPRECATED
    // ==================================================================================
    // Tools are now LLM-driven and executed through the agent loop.
    // User-invoked actions should use the Workflow system instead.
    //
    // Deprecated endpoints (scheduled for removal):
    // - POST /tools/execute -> Use workflows for user-invoked actions
    // - GET /tools/categories -> Use GET /v1/workflows/categories
    // - GET /tools/category/{id}/info -> Use workflow category info
    // - /tools/available was already removed (tools are injected into system prompts)
    //
    // Migration path:
    // 1. Frontend should use WorkflowService instead of ToolService
    // 2. Update any direct tool execution calls to use workflow execution
    // 3. Remove references to tool categories (use workflow categories)
    // ==================================================================================

    cfg.service(web::resource("/tools/execute").route(web::post().to(execute_tool)))
        .service(web::resource("/tools/categories").route(web::get().to(get_categories)))
        .service(
            web::resource("/tools/category/{id}/info").route(web::get().to(get_category_info)),
        );
}
