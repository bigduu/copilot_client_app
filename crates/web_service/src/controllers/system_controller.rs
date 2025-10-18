use actix_web::{web, HttpResponse, Responder};
use mcp_client::client::{McpClientStatus, MCP_CLIENT_MANAGER};
use mcp_client::model::McpServersConfig;
use std::fs;
use std::path::PathBuf;

const MCP_SERVERS_FILE: &str = "mcp_servers.json";

fn get_config_path() -> PathBuf {
    PathBuf::from(MCP_SERVERS_FILE)
}

async fn get_mcp_servers() -> impl Responder {
    let path = get_config_path();
    if !path.exists() {
        return HttpResponse::Ok().json(McpServersConfig::default());
    }
    match fs::read_to_string(&path) {
        Ok(content) => match serde_json::from_str::<McpServersConfig>(&content) {
            Ok(config) => HttpResponse::Ok().json(config),
            Err(e) => HttpResponse::InternalServerError().body(e.to_string()),
        },
        Err(e) => HttpResponse::InternalServerError().body(e.to_string()),
    }
}

async fn set_mcp_servers(config: web::Json<McpServersConfig>) -> impl Responder {
    let path = get_config_path();
    match serde_json::to_string_pretty(&config.into_inner()) {
        Ok(content) => match fs::write(&path, content) {
            Ok(_) => HttpResponse::Ok().finish(),
            Err(e) => HttpResponse::InternalServerError().body(e.to_string()),
        },
        Err(e) => HttpResponse::InternalServerError().body(e.to_string()),
    }
}

async fn get_mcp_client_status(path: web::Path<String>) -> impl Responder {
    let name = path.into_inner();
    if let Some(manager) = MCP_CLIENT_MANAGER.get() {
        HttpResponse::Ok().json(manager.get_status(&name))
    } else {
        HttpResponse::ServiceUnavailable().body("MCP_CLIENT_MANAGER not initialized")
    }
}

async fn health_check() -> impl Responder {
    HttpResponse::Ok().body("OK")
}

pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(web::resource("/mcp/servers").route(web::get().to(get_mcp_servers)))
        .service(web::resource("/mcp/servers").route(web::post().to(set_mcp_servers)))
        .service(web::resource("/mcp/status/{name}").route(web::get().to(get_mcp_client_status)))
        .service(web::resource("/health").route(web::get().to(health_check)));
}
