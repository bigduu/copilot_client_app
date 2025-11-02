//! Workflow controller for HTTP API

use actix_web::{web::{Data, Json, Path}, HttpResponse, Result};
use log::{error, info};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::services::workflow_service::WorkflowService;

/// Request to execute a workflow
#[derive(Debug, Deserialize)]
pub struct WorkflowExecutionRequest {
    pub workflow_name: String,
    pub parameters: HashMap<String, serde_json::Value>,
}

/// Response from workflow execution
#[derive(Debug, Serialize)]
pub struct WorkflowExecutionResponse {
    pub success: bool,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
}

/// Response listing all workflows
#[derive(Debug, Serialize)]
pub struct ListWorkflowsResponse {
    pub workflows: Vec<workflow_system::WorkflowDefinition>,
}

/// Response listing workflow categories
#[derive(Debug, Serialize)]
pub struct ListCategoriesResponse {
    pub categories: Vec<String>,
}

/// List all available workflows
pub async fn list_workflows(service: Data<WorkflowService>) -> Result<HttpResponse> {
    let workflows = service.list_workflows();
    Ok(HttpResponse::Ok().json(ListWorkflowsResponse { workflows }))
}

/// Get a specific workflow by name
pub async fn get_workflow(
    path: Path<String>,
    service: Data<WorkflowService>,
) -> Result<HttpResponse> {
    let workflow_name = path.into_inner();
    
    match service.get_workflow(&workflow_name) {
        Some(workflow) => Ok(HttpResponse::Ok().json(workflow)),
        None => {
            info!("Workflow not found: {}", workflow_name);
            Ok(HttpResponse::NotFound().json(serde_json::json!({
                "error": "Workflow not found"
            })))
        }
    }
}

/// List all workflow categories
pub async fn list_categories(service: Data<WorkflowService>) -> Result<HttpResponse> {
    let workflows = service.list_workflows();
    let mut categories: Vec<String> = workflows
        .iter()
        .map(|w| w.category.clone())
        .collect();
    
    // Remove duplicates
    categories.sort();
    categories.dedup();
    
    Ok(HttpResponse::Ok().json(ListCategoriesResponse { categories }))
}

/// Execute a workflow
pub async fn execute_workflow(
    req: Json<WorkflowExecutionRequest>,
    service: Data<WorkflowService>,
) -> Result<HttpResponse> {
    info!("Executing workflow: {} with parameters: {:?}", req.workflow_name, req.parameters);
    
    match service.execute_workflow(&req.workflow_name, req.parameters.clone()).await {
        Ok(result) => {
            Ok(HttpResponse::Ok().json(WorkflowExecutionResponse {
                success: true,
                result: Some(result),
                error: None,
            }))
        }
        Err(e) => {
            error!("Workflow execution failed: {}", e);
            Ok(HttpResponse::Ok().json(WorkflowExecutionResponse {
                success: false,
                result: None,
                error: Some(e.to_string()),
            }))
        }
    }
}

/// Configure workflow routes
pub fn config(cfg: &mut actix_web::web::ServiceConfig) {
    cfg.service(
        actix_web::web::scope("/workflows")
            .route("/available", actix_web::web::get().to(list_workflows))
            .route("/categories", actix_web::web::get().to(list_categories))
            .route("/{name}", actix_web::web::get().to(get_workflow))
            .route("/execute", actix_web::web::post().to(execute_workflow)),
    );
}


