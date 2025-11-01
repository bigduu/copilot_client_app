use crate::error::AppError;
use crate::models::ToolExecutionRequest;
use crate::services::tool_service::ToolService;
use actix_web::{web, HttpResponse, Responder};

async fn get_tools_for_ui(tool_service: web::Data<ToolService>) -> impl Responder {
    let response = tool_service.get_tools_for_ui(None); // Always fetch all tools
    HttpResponse::Ok().json(response)
}

async fn execute_tool(
    tool_service: web::Data<ToolService>,
    request: web::Json<ToolExecutionRequest>,
) -> Result<HttpResponse, AppError> {
    let result = tool_service.execute_tool(request.into_inner()).await?;
    Ok(HttpResponse::Ok().json(result))
}

async fn get_categories(tool_service: web::Data<ToolService>) -> impl Responder {
    let categories = tool_service.get_categories();
    HttpResponse::Ok().json(categories)
}

async fn get_category_info(
    tool_service: web::Data<ToolService>,
    path: web::Path<String>,
) -> impl Responder {
    let category_id = path.into_inner();
    match tool_service.get_category(&category_id) {
        Some(info) => HttpResponse::Ok().json(info),
        None => HttpResponse::NotFound().json(serde_json::json!({
            "error": "Category not found"
        })),
    }
}

pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(web::resource("/tools/available").route(web::get().to(get_tools_for_ui)))
        .service(web::resource("/tools/execute").route(web::post().to(execute_tool)))
        .service(web::resource("/tools/categories").route(web::get().to(get_categories)))
        .service(
            web::resource("/tools/category/{id}/info").route(web::get().to(get_category_info)),
        );
}
