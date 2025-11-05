use crate::services::template_variable_service::TemplateVariableService;
use actix_web::{
    web::{Data, Json, Path},
    HttpResponse, Result,
};
use log::{error, info};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Deserialize, Debug)]
pub struct SetTemplateVariableRequest {
    pub key: String,
    pub value: String,
}

#[derive(Deserialize, Debug)]
pub struct SetMultipleTemplateVariablesRequest {
    pub variables: HashMap<String, String>,
}

#[derive(Serialize, Debug)]
pub struct ListTemplateVariablesResponse {
    pub variables: HashMap<String, String>,
}

#[derive(Serialize, Debug)]
pub struct GetTemplateVariableResponse {
    pub key: String,
    pub value: String,
}

/// Get all template variables
pub async fn list_template_variables(
    service: Data<TemplateVariableService>,
) -> Result<HttpResponse> {
    let variables = service.get_all().await;
    Ok(HttpResponse::Ok().json(ListTemplateVariablesResponse { variables }))
}

/// Get a specific template variable by key
pub async fn get_template_variable(
    path: Path<String>,
    service: Data<TemplateVariableService>,
) -> Result<HttpResponse> {
    let key = path.into_inner();

    match service.get(&key).await {
        Some(value) => Ok(HttpResponse::Ok().json(GetTemplateVariableResponse { key, value })),
        None => {
            info!("Template variable not found: {}", key);
            Ok(HttpResponse::NotFound().json(serde_json::json!({
                "error": "Template variable not found"
            })))
        }
    }
}

/// Set a single template variable
pub async fn set_template_variable(
    req: Json<SetTemplateVariableRequest>,
    service: Data<TemplateVariableService>,
) -> Result<HttpResponse> {
    match service.set(req.key.clone(), req.value.clone()).await {
        Ok(_) => {
            info!("Set template variable: {} = {}", req.key, req.value);
            Ok(HttpResponse::Ok().json(serde_json::json!({
                "message": "Template variable set successfully",
                "key": req.key,
                "value": req.value
            })))
        }
        Err(e) => {
            error!("Failed to set template variable: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to set template variable: {}", e)
            })))
        }
    }
}

/// Set multiple template variables at once
pub async fn set_multiple_template_variables(
    req: Json<SetMultipleTemplateVariablesRequest>,
    service: Data<TemplateVariableService>,
) -> Result<HttpResponse> {
    match service.set_multiple(req.variables.clone()).await {
        Ok(_) => {
            info!("Set {} template variables", req.variables.len());
            Ok(HttpResponse::Ok().json(serde_json::json!({
                "message": "Template variables set successfully",
                "count": req.variables.len()
            })))
        }
        Err(e) => {
            error!("Failed to set template variables: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to set template variables: {}", e)
            })))
        }
    }
}

/// Delete a template variable
pub async fn delete_template_variable(
    path: Path<String>,
    service: Data<TemplateVariableService>,
) -> Result<HttpResponse> {
    let key = path.into_inner();

    match service.delete(&key).await {
        Ok(_) => {
            info!("Deleted template variable: {}", key);
            Ok(HttpResponse::Ok().json(serde_json::json!({
                "message": "Template variable deleted successfully"
            })))
        }
        Err(e) => {
            error!("Failed to delete template variable: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to delete template variable: {}", e)
            })))
        }
    }
}

/// Reload template variables from storage (for real-time updates)
pub async fn reload_template_variables(
    service: Data<TemplateVariableService>,
) -> Result<HttpResponse> {
    match service.reload().await {
        Ok(_) => {
            info!("Reloaded template variables from storage");
            Ok(HttpResponse::Ok().json(serde_json::json!({
                "message": "Template variables reloaded successfully"
            })))
        }
        Err(e) => {
            error!("Failed to reload template variables: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to reload template variables: {}", e)
            })))
        }
    }
}

pub fn config(cfg: &mut actix_web::web::ServiceConfig) {
    cfg.service(
        actix_web::web::scope("/template-variables")
            .service(
                actix_web::web::resource("")
                    .route(actix_web::web::get().to(list_template_variables))
                    .route(actix_web::web::post().to(set_template_variable))
                    .route(actix_web::web::put().to(set_multiple_template_variables)),
            )
            .service(
                actix_web::web::resource("/reload")
                    .route(actix_web::web::post().to(reload_template_variables)),
            )
            .service(
                actix_web::web::resource("/{key}")
                    .route(actix_web::web::get().to(get_template_variable))
                    .route(actix_web::web::delete().to(delete_template_variable)),
            ),
    );
}
