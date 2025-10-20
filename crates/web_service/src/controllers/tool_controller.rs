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

async fn get_tools_documentation(tool_service: web::Data<ToolService>) -> impl Responder {
    let doc = tool_service.get_tools_documentation();
    HttpResponse::Ok().body(doc)
}

async fn get_categories_for_ui(tool_service: web::Data<ToolService>) -> impl Responder {
    let categories = tool_service.get_categories_for_ui();
    HttpResponse::Ok().json(categories)
}

pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(web::resource("/tools/available").route(web::get().to(get_tools_for_ui)))
        .service(web::resource("/tools/execute").route(web::post().to(execute_tool)))
        .service(
            web::resource("/tools/documentation").route(web::get().to(get_tools_documentation)),
        )
        .service(web::resource("/tools/categories").route(web::get().to(get_categories_for_ui)));
}
