use actix_web::{get, post, web, HttpResponse};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::AppError;
use crate::server::AppState;

#[derive(Serialize)]
struct McpStatusResponse {
    name: String,
    status: String,
    message: Option<String>,
}

#[derive(Deserialize)]
struct ToolExecutionRequest {
    tool_name: String,
    parameters: Vec<ToolParameter>,
}

#[derive(Deserialize)]
struct ToolParameter {
    name: String,
    value: String,
}

#[derive(Serialize)]
struct ToolExecutionResponse {
    result: String,
}

#[derive(Serialize)]
struct ToolExecutionResultPayload {
    tool_name: String,
    result: String,
    display_preference: String,
}

#[derive(Serialize)]
struct ToolsResponse {
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

#[get("/mcp/servers")]
pub async fn get_mcp_servers(app_state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    let config = app_state.mcp_runtime.get_config().await;
    Ok(HttpResponse::Ok().json(config))
}

#[post("/mcp/servers")]
pub async fn set_mcp_servers(
    app_state: web::Data<AppState>,
    payload: web::Json<mcp_client::model::McpServersConfig>,
) -> Result<HttpResponse, AppError> {
    app_state
        .mcp_runtime
        .set_config(payload.into_inner())
        .await
        .map_err(AppError::InternalError)?;
    let config = app_state.mcp_runtime.get_config().await;
    Ok(HttpResponse::Ok().json(config))
}

#[post("/mcp/reload")]
pub async fn reload_mcp_servers(
    app_state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let config = app_state
        .mcp_runtime
        .reload_from_file()
        .await
        .map_err(AppError::InternalError)?;
    Ok(HttpResponse::Ok().json(config))
}

#[get("/mcp/status/{name}")]
pub async fn get_mcp_status(
    app_state: web::Data<AppState>,
    name: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let name = name.into_inner();
    let Some(status) = app_state.mcp_runtime.get_status(&name).await else {
        return Err(AppError::NotFound(format!("MCP server '{}' not found", name)));
    };
    let (status_label, message) = match status {
        mcp_client::client::McpClientStatus::Starting => ("starting".to_string(), None),
        mcp_client::client::McpClientStatus::Running => ("running".to_string(), None),
        mcp_client::client::McpClientStatus::Stopped => ("stopped".to_string(), None),
        mcp_client::client::McpClientStatus::Error(msg) => ("error".to_string(), Some(msg)),
    };
    Ok(HttpResponse::Ok().json(McpStatusResponse {
        name,
        status: status_label,
        message,
    }))
}

#[get("/mcp/tools")]
pub async fn get_mcp_tools(app_state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    let tools = app_state
        .mcp_runtime
        .list_tools()
        .await
        .map_err(AppError::InternalError)?;
    let tools = tools
        .into_iter()
        .map(|(server_name, tool)| OpenAiTool {
            tool_type: "function".to_string(),
            function: OpenAiFunction {
                name: format!("{}::{}", server_name, tool.name),
                description: tool.description.to_string(),
                parameters: tool.schema_as_json_value(),
            },
        })
        .collect();
    Ok(HttpResponse::Ok().json(ToolsResponse { tools }))
}

#[post("/tools/execute")]
pub async fn execute_tool(
    app_state: web::Data<AppState>,
    payload: web::Json<ToolExecutionRequest>,
) -> Result<HttpResponse, AppError> {
    let request = payload.into_inner();
    let (server_name, tool_name) = split_tool_name(&request.tool_name)?;
    let config = app_state.mcp_runtime.get_config().await;
    if let Some(server_config) = config.mcp_servers.get(&server_name) {
        if server_config.disabled.unwrap_or(false) {
            return Err(AppError::ToolExecutionError(format!(
                "MCP server '{}' is disabled",
                server_name
            )));
        }
    } else {
        return Err(AppError::ToolNotFound(request.tool_name));
    }
    let mut args = serde_json::Map::new();
    for param in request.parameters {
        let parsed = serde_json::from_str(&param.value).unwrap_or(Value::String(param.value));
        args.insert(param.name, parsed);
    }
    let result = app_state
        .mcp_runtime
        .execute_tool(&server_name, &tool_name, args)
        .await
        .map_err(|err| AppError::ToolExecutionError(err.to_string()))?;
    let result_payload = ToolExecutionResultPayload {
        tool_name: request.tool_name,
        result: serde_json::to_string(&result).map_err(AppError::SerializationError)?,
        display_preference: "Default".to_string(),
    };
    let response = ToolExecutionResponse {
        result: serde_json::to_string(&result_payload).map_err(AppError::SerializationError)?,
    };
    Ok(HttpResponse::Ok().json(response))
}

fn split_tool_name(tool_name: &str) -> Result<(String, String), AppError> {
    let mut parts = tool_name.splitn(2, "::");
    let server_name = parts
        .next()
        .ok_or_else(|| AppError::ToolNotFound(tool_name.to_string()))?;
    let tool = parts
        .next()
        .ok_or_else(|| AppError::ToolNotFound(tool_name.to_string()))?;
    Ok((server_name.to_string(), tool.to_string()))
}

pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(get_mcp_servers)
        .service(set_mcp_servers)
        .service(reload_mcp_servers)
        .service(get_mcp_status)
        .service(get_mcp_tools)
        .service(execute_tool);
}
