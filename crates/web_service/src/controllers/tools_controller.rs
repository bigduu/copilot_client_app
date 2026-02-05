use actix_web::{post, web, HttpResponse};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use builtin_tools::{BuiltinToolExecutor, normalize_tool_ref};
use copilot_agent_core::tools::{FunctionCall, ToolCall};
use copilot_agent_core::ToolExecutor;

use crate::error::AppError;

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

#[post("/tools/execute")]
pub async fn execute_tool(
    payload: web::Json<ToolExecutionRequest>,
) -> Result<HttpResponse, AppError> {
    let request = payload.into_inner();
    let normalized = normalize_tool_ref(&request.tool_name)
        .ok_or_else(|| AppError::ToolNotFound(request.tool_name.clone()))?;

    let mut args = serde_json::Map::new();
    for param in request.parameters {
        let parsed = serde_json::from_str(&param.value).unwrap_or(Value::String(param.value));
        args.insert(param.name, parsed);
    }

    let call = ToolCall {
        id: "tool_call".to_string(),
        tool_type: "function".to_string(),
        function: FunctionCall {
            name: normalized,
            arguments: serde_json::to_string(&args).map_err(AppError::SerializationError)?,
        },
    };

    let executor = BuiltinToolExecutor::new();
    let result = executor
        .execute(&call)
        .await
        .map_err(|err| AppError::ToolExecutionError(err.to_string()))?;

    let result_payload = ToolExecutionResultPayload {
        tool_name: request.tool_name,
        result: result.result,
        display_preference: "Default".to_string(),
    };
    let response = ToolExecutionResponse {
        result: serde_json::to_string(&result_payload).map_err(AppError::SerializationError)?,
    };

    Ok(HttpResponse::Ok().json(response))
}

pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(execute_tool);
}
