use actix_web::{
    web::{Data, Json, Path, Query},
    HttpResponse, Result,
};
use log::{error, info};
use serde::{Deserialize, Serialize};

use crate::services::workflow_manager_service::{
    WorkflowManagerService, WorkflowMetadata, WorkflowSource,
};

/// Request to create a new workflow
#[derive(Debug, Deserialize)]
pub struct CreateWorkflowRequest {
    pub name: String,
    pub content: String,
    pub source: WorkflowSource,
    pub workspace_path: Option<String>,
}

/// Request to update a workflow
#[derive(Debug, Deserialize)]
pub struct UpdateWorkflowRequest {
    pub content: String,
    pub workspace_path: Option<String>,
}

/// Request to delete a workflow
#[derive(Debug, Deserialize)]
pub struct DeleteWorkflowRequest {
    pub source: WorkflowSource,
    pub workspace_path: Option<String>,
}

/// Query parameters for list workflows
#[derive(Debug, Deserialize)]
pub struct ListWorkflowsQuery {
    pub workspace_path: Option<String>,
}

/// Query parameters for get workflow
#[derive(Debug, Deserialize)]
pub struct GetWorkflowQuery {
    pub workspace_path: Option<String>,
}

/// Response listing all workflows
#[derive(Debug, Serialize)]
pub struct ListWorkflowsResponse {
    pub workflows: Vec<WorkflowMetadata>,
}

/// List all workflows from global and workspace locations
pub async fn list_workflows(
    service: Data<WorkflowManagerService>,
    query: Query<ListWorkflowsQuery>,
) -> Result<HttpResponse> {
    let workspace_path = query
        .workspace_path
        .as_ref()
        .map(|p| std::path::Path::new(p));

    match service.list_workflows(workspace_path) {
        Ok(workflows) => {
            info!("Listed {} workflows", workflows.len());
            Ok(HttpResponse::Ok().json(ListWorkflowsResponse { workflows }))
        }
        Err(e) => {
            error!("Failed to list workflows: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to list workflows: {}", e)
            })))
        }
    }
}

/// Get a specific workflow by name
pub async fn get_workflow(
    path: Path<String>,
    service: Data<WorkflowManagerService>,
    query: Query<GetWorkflowQuery>,
) -> Result<HttpResponse> {
    let workflow_name = path.into_inner();
    let workspace_path = query
        .workspace_path
        .as_ref()
        .map(|p| std::path::Path::new(p));

    match service.get_workflow(&workflow_name, workspace_path) {
        Ok(workflow) => {
            info!("Retrieved workflow: {}", workflow_name);
            Ok(HttpResponse::Ok().json(workflow))
        }
        Err(_e) => {
            info!("Workflow not found: {}", workflow_name);
            Ok(HttpResponse::NotFound().json(serde_json::json!({
                "error": format!("Workflow '{}' not found", workflow_name)
            })))
        }
    }
}

/// Create a new workflow
pub async fn create_workflow(
    req: Json<CreateWorkflowRequest>,
    service: Data<WorkflowManagerService>,
) -> Result<HttpResponse> {
    info!("Creating workflow: {}", req.name);

    let workspace_path = req
        .workspace_path
        .as_ref()
        .map(|p| std::path::Path::new(p.as_str()));

    match service.create_workflow(&req.name, &req.content, req.source.clone(), workspace_path) {
        Ok(_) => {
            info!("Successfully created workflow: {}", req.name);
            Ok(HttpResponse::Created().json(serde_json::json!({
                "success": true,
                "message": format!("Workflow '{}' created successfully", req.name)
            })))
        }
        Err(e) => {
            error!("Failed to create workflow: {}", e);
            Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": format!("Failed to create workflow: {}", e)
            })))
        }
    }
}

/// Update an existing workflow
pub async fn update_workflow(
    path: Path<String>,
    req: Json<UpdateWorkflowRequest>,
    service: Data<WorkflowManagerService>,
) -> Result<HttpResponse> {
    let workflow_name = path.into_inner();
    info!("Updating workflow: {}", workflow_name);

    let workspace_path = req
        .workspace_path
        .as_ref()
        .map(|p| std::path::Path::new(p.as_str()));

    match service.update_workflow(&workflow_name, &req.content, workspace_path) {
        Ok(_) => {
            info!("Successfully updated workflow: {}", workflow_name);
            Ok(HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "message": format!("Workflow '{}' updated successfully", workflow_name)
            })))
        }
        Err(e) => {
            error!("Failed to update workflow: {}", e);
            Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": format!("Failed to update workflow: {}", e)
            })))
        }
    }
}

/// Delete a workflow
pub async fn delete_workflow(
    path: Path<String>,
    req: Json<DeleteWorkflowRequest>,
    service: Data<WorkflowManagerService>,
) -> Result<HttpResponse> {
    let workflow_name = path.into_inner();
    info!("Deleting workflow: {}", workflow_name);

    let workspace_path = req
        .workspace_path
        .as_ref()
        .map(|p| std::path::Path::new(p.as_str()));

    match service.delete_workflow(&workflow_name, req.source.clone(), workspace_path) {
        Ok(_) => {
            info!("Successfully deleted workflow: {}", workflow_name);
            Ok(HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "message": format!("Workflow '{}' deleted successfully", workflow_name)
            })))
        }
        Err(e) => {
            error!("Failed to delete workflow: {}", e);
            Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": format!("Failed to delete workflow: {}", e)
            })))
        }
    }
}

/// Configure workflow manager routes
pub fn config(cfg: &mut actix_web::web::ServiceConfig) {
    cfg.service(
        actix_web::web::scope("/workflow-manager")
            .route("", actix_web::web::get().to(list_workflows))
            .route("", actix_web::web::post().to(create_workflow))
            .route("/{name}", actix_web::web::get().to(get_workflow))
            .route("/{name}", actix_web::web::put().to(update_workflow))
            .route("/{name}", actix_web::web::delete().to(delete_workflow)),
    );
}
