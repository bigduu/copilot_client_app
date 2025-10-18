use crate::error::AppError;
use crate::models::ToolExecutionRequest;
use crate::services::tool_service::ToolService;
use actix_web::{web, HttpResponse, Responder};
use serde::Deserialize;

#[derive(Deserialize)]
struct ToolsUIParams {
    category_id: Option<String>,
}

async fn get_available_tools(tool_service: web::Data<ToolService>) -> impl Responder {
    let tools = tool_service.get_available_tools();
    HttpResponse::Ok().body(tools)
}

async fn get_tools_for_ui(
    tool_service: web::Data<ToolService>,
    params: web::Query<ToolsUIParams>,
) -> impl Responder {
    let response = tool_service.get_tools_for_ui(params.into_inner().category_id);
    HttpResponse::Ok().json(response)
}

async fn execute_tool(
    tool_service: web::Data<ToolService>,
    request: web::Json<ToolExecutionRequest>,
) -> Result<HttpResponse, AppError> {
    let result = tool_service.execute_tool(request.into_inner()).await?;
    Ok(HttpResponse::Ok().json(result))
}

async fn get_tool_categories(tool_service: web::Data<ToolService>) -> impl Responder {
    let categories = tool_service.get_tool_categories();
    HttpResponse::Ok().json(categories)
}

async fn get_category_tools(
    tool_service: web::Data<ToolService>,
    path: web::Path<String>,
) -> impl Responder {
    let tools = tool_service.get_category_tools(path.into_inner());
    HttpResponse::Ok().json(tools)
}

async fn get_tool_category_info(
    tool_service: web::Data<ToolService>,
    path: web::Path<String>,
) -> impl Responder {
    let info = tool_service.get_tool_category_info(path.into_inner());
    HttpResponse::Ok().json(info)
}

async fn get_category_system_prompt(
    tool_service: web::Data<ToolService>,
    path: web::Path<String>,
) -> impl Responder {
    let prompt = tool_service.get_category_system_prompt(path.into_inner());
    HttpResponse::Ok().json(prompt)
}

async fn get_tools_documentation(tool_service: web::Data<ToolService>) -> impl Responder {
    let doc = tool_service.get_tools_documentation();
    HttpResponse::Ok().body(doc)
}

pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(web::resource("/tools/available").route(web::get().to(get_available_tools)))
        .service(web::resource("/tools/ui").route(web::get().to(get_tools_for_ui)))
        .service(web::resource("/tools/execute").route(web::post().to(execute_tool)))
        .service(web::resource("/tools/categories").route(web::get().to(get_tool_categories)))
        .service(
            web::resource("/tools/category/{id}/tools").route(web::get().to(get_category_tools)),
        )
        .service(
            web::resource("/tools/category/{id}/info").route(web::get().to(get_tool_category_info)),
        )
        .service(
            web::resource("/tools/category/{id}/system_prompt")
                .route(web::get().to(get_category_system_prompt)),
        )
        .service(
            web::resource("/tools/documentation").route(web::get().to(get_tools_documentation)),
        );
}
