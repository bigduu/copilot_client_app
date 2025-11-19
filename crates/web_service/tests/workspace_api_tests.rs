use actix_http::Request;
use actix_web::dev::{Service, ServiceResponse};
use actix_web::{test, web, App, Error};
use std::sync::Arc;
use tempfile::TempDir;
use tokio::fs;

use copilot_client::{config::Config, CopilotClient, CopilotClientTrait};
use session_manager::{FileSessionStorage, MultiUserSessionManager};
use tool_system::{registry::create_default_tool_registry, ToolExecutor};
use web_service::server::{app_config, AppState};
use web_service::services::{
    approval_manager::ApprovalManager, event_broadcaster::EventBroadcaster,
    session_manager::ChatSessionManager, system_prompt_service::SystemPromptService,
    template_variable_service::TemplateVariableService,
    user_preference_service::UserPreferenceService, workflow_service::WorkflowService,
};
use web_service::storage::message_pool_provider::MessagePoolStorageProvider;
use web_service::workspace_service::{
    AddRecentRequest, ValidatePathRequest, WorkspaceMetadata, WorkspaceService,
};
use workflow_system::WorkflowRegistry;

async fn create_test_app() -> (
    impl Service<Request, Response = ServiceResponse, Error = Error>,
    TempDir,
) {
    let temp_dir = TempDir::new().unwrap();
    let storage_provider = Arc::new(MessagePoolStorageProvider::new(
        temp_dir.path().join("data"),
    ));
    let tool_registry = Arc::new(std::sync::Mutex::new(create_default_tool_registry()));
    let session_manager = Arc::new(ChatSessionManager::new(
        storage_provider,
        100,
        tool_registry.clone(),
    ));

    let system_prompt_service = Arc::new(SystemPromptService::new(temp_dir.path().to_path_buf()));
    let template_variable_service =
        Arc::new(TemplateVariableService::new(temp_dir.path().to_path_buf()));
    let user_preference_service =
        Arc::new(UserPreferenceService::new(temp_dir.path().to_path_buf()));
    let approval_manager = Arc::new(ApprovalManager::new());

    let config = Config::new();
    let copilot_client: Arc<dyn CopilotClientTrait> =
        Arc::new(CopilotClient::new(config, temp_dir.path().to_path_buf()));

    let tool_executor = Arc::new(ToolExecutor::new(tool_registry.clone()));

    let workflow_registry = Arc::new(WorkflowRegistry::new());
    let workflow_service = Arc::new(WorkflowService::new(workflow_registry));

    let session_storage = FileSessionStorage::new(temp_dir.path().join("sessions"));
    let user_session_manager = MultiUserSessionManager::new(session_storage);

    let event_broadcaster = Arc::new(EventBroadcaster::new());

    let app_state = web::Data::new(AppState {
        session_manager,
        tool_executor,
        copilot_client,
        system_prompt_service,
        template_variable_service,
        approval_manager,
        user_preference_service,
        workflow_service,
        event_broadcaster,
        app_data_dir: temp_dir.path().to_path_buf(),
    });

    let app = test::init_service(
        App::new()
            .app_data(app_state)
            .app_data(web::Data::new(user_session_manager))
            .configure(app_config),
    )
    .await;

    (app, temp_dir)
}

#[actix_web::test]
async fn test_validate_workspace_path_valid() {
    let (app, temp_dir) = create_test_app().await;

    // Create a test directory
    let test_dir = temp_dir.path().join("test_workspace");
    fs::create_dir_all(&test_dir).await.unwrap();

    // Create some files to make it look like a workspace
    fs::write(test_dir.join("package.json"), r#"{"name": "test"}"#)
        .await
        .unwrap();
    fs::write(test_dir.join("README.md"), "# Test")
        .await
        .unwrap();

    let req = test::TestRequest::post()
        .uri("/v1/workspace/validate")
        .set_json(&ValidatePathRequest {
            path: test_dir.to_string_lossy().to_string(),
        })
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert!(resp.status().is_success());

    let body: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(body["is_valid"].as_bool(), Some(true));
    assert_eq!(
        body["path"].as_str(),
        Some(test_dir.to_string_lossy().as_ref())
    );
    assert!(body["workspace_name"].is_string());
    assert!(body["file_count"].as_u64().unwrap() > 0);
}

#[actix_web::test]
async fn test_validate_workspace_path_nonexistent() {
    let (app, _temp_dir) = create_test_app().await;

    let req = test::TestRequest::post()
        .uri("/v1/workspace/validate")
        .set_json(&ValidatePathRequest {
            path: "/nonexistent/path/that/should/not/exist".to_string(),
        })
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert!(resp.status().is_success());

    let body: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(body["is_valid"].as_bool(), Some(false));
    assert!(body["error_message"].is_string());
}

#[actix_web::test]
async fn test_validate_workspace_path_empty() {
    let (app, _temp_dir) = create_test_app().await;

    let req = test::TestRequest::post()
        .uri("/v1/workspace/validate")
        .set_json(&ValidatePathRequest {
            path: "".to_string(),
        })
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert!(resp.status().is_success());

    let body: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(body["is_valid"].as_bool(), Some(false));
    let error_msg = body["error_message"].as_str().unwrap();
    assert!(error_msg.contains("empty") || error_msg.contains("Path does not exist"));
}

#[actix_web::test]
async fn test_validate_workspace_path_file_instead_of_directory() {
    let (app, temp_dir) = create_test_app().await;

    // Create a test file (not directory)
    let test_file = temp_dir.path().join("test_file.txt");
    fs::write(&test_file, "test content").await.unwrap();

    let req = test::TestRequest::post()
        .uri("/v1/workspace/validate")
        .set_json(&ValidatePathRequest {
            path: test_file.to_string_lossy().to_string(),
        })
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert!(resp.status().is_success());

    let body: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(body["is_valid"].as_bool(), Some(false));
    assert!(body["error_message"]
        .as_str()
        .unwrap()
        .contains("directory"));
}

#[actix_web::test]
async fn test_get_recent_workspaces_empty() {
    let (app, _temp_dir) = create_test_app().await;

    let req = test::TestRequest::get()
        .uri("/v1/workspace/recent")
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert!(resp.status().is_success());

    let body: serde_json::Value = test::read_body_json(resp).await;
    assert!(body.is_array());
    assert_eq!(body.as_array().unwrap().len(), 0);
}

#[actix_web::test]
async fn test_add_and_get_recent_workspaces() {
    let (app, temp_dir) = create_test_app().await;

    // Create test directories
    let workspace1 = temp_dir.path().join("workspace1");
    let workspace2 = temp_dir.path().join("workspace2");
    fs::create_dir_all(&workspace1).await.unwrap();
    fs::create_dir_all(&workspace2).await.unwrap();
    fs::write(workspace1.join("Cargo.toml"), "[package]")
        .await
        .unwrap();
    fs::write(workspace2.join("package.json"), "{}")
        .await
        .unwrap();

    // Add first workspace
    let req1 = test::TestRequest::post()
        .uri("/v1/workspace/recent")
        .set_json(&AddRecentRequest {
            path: workspace1.to_string_lossy().to_string(),
            metadata: None,
        })
        .to_request();

    let resp1 = test::call_service(&app, req1).await;
    assert!(resp1.status().is_success());

    // Add second workspace
    let req2 = test::TestRequest::post()
        .uri("/v1/workspace/recent")
        .set_json(&AddRecentRequest {
            path: workspace2.to_string_lossy().to_string(),
            metadata: Some(WorkspaceMetadata {
                workspace_name: Some("Test Workspace".to_string()),
                description: Some("A test workspace".to_string()),
                tags: Some(vec!["test".to_string(), "example".to_string()]),
            }),
        })
        .to_request();

    let resp2 = test::call_service(&app, req2).await;
    assert!(resp2.status().is_success());

    // Get recent workspaces
    let req3 = test::TestRequest::get()
        .uri("/v1/workspace/recent")
        .to_request();

    let resp3 = test::call_service(&app, req3).await;
    assert!(resp3.status().is_success());

    let body: serde_json::Value = test::read_body_json(resp3).await;
    let workspaces = body.as_array().unwrap();
    assert_eq!(workspaces.len(), 2);

    // The most recently added workspace should be first
    let first_workspace = &workspaces[0];
    assert_eq!(
        first_workspace["path"].as_str(),
        Some(workspace2.to_string_lossy().as_ref())
    );
    assert_eq!(first_workspace["is_valid"].as_bool(), Some(true));
    assert_eq!(first_workspace["workspace_name"], "Test Workspace");
}

#[actix_web::test]
async fn test_add_recent_workspace_with_metadata() {
    let (app, temp_dir) = create_test_app().await;

    let workspace = temp_dir.path().join("test_workspace");
    fs::create_dir_all(&workspace).await.unwrap();
    fs::write(workspace.join("package.json"), r#"{"name": "test"}"#)
        .await
        .unwrap();

    let metadata = WorkspaceMetadata {
        workspace_name: Some("My Test Workspace".to_string()),
        description: Some("A workspace for testing".to_string()),
        tags: Some(vec!["test".to_string(), "workspace".to_string()]),
    };

    let req = test::TestRequest::post()
        .uri("/v1/workspace/recent")
        .set_json(&AddRecentRequest {
            path: workspace.to_string_lossy().to_string(),
            metadata: Some(metadata),
        })
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert!(resp.status().is_success());
}

#[actix_web::test]
async fn test_get_path_suggestions() {
    let (app, _temp_dir) = create_test_app().await;

    let req = test::TestRequest::get()
        .uri("/v1/workspace/suggestions")
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert!(resp.status().is_success());

    let body: serde_json::Value = test::read_body_json(resp).await;
    assert!(body["suggestions"].is_array());

    let suggestions = body["suggestions"].as_array().unwrap();
    // Should have some suggestions like home, documents, etc.
    assert!(!suggestions.is_empty());

    // Check that suggestions have required fields
    for suggestion in suggestions {
        assert!(suggestion["path"].is_string());
        assert!(suggestion["name"].is_string());
        assert!(suggestion["suggestion_type"].is_string());
    }
}

#[actix_web::test]
async fn test_add_invalid_workspace_to_recent() {
    let (app, _temp_dir) = create_test_app().await;

    let req = test::TestRequest::post()
        .uri("/v1/workspace/recent")
        .set_json(&AddRecentRequest {
            path: "/nonexistent/path".to_string(),
            metadata: None,
        })
        .to_request();

    let resp = test::call_service(&app, req).await;
    // Should still succeed, but the workspace won't be added to recent list
    assert!(resp.status().is_success());

    // Verify it wasn't added
    let req2 = test::TestRequest::get()
        .uri("/v1/workspace/recent")
        .to_request();

    let resp2 = test::call_service(&app, req2).await;
    assert!(resp2.status().is_success());

    let body: serde_json::Value = test::read_body_json(resp2).await;
    assert_eq!(body.as_array().unwrap().len(), 0);
}

#[actix_web::test]
async fn test_workspace_service_direct() {
    let temp_dir = TempDir::new().unwrap();
    let workspace_service = WorkspaceService::new(temp_dir.path().to_path_buf());

    // Create a test workspace
    let test_workspace = temp_dir.path().join("test_project");
    fs::create_dir_all(&test_workspace).await.unwrap();
    fs::write(test_workspace.join("package.json"), r#"{"name": "test"}"#)
        .await
        .unwrap();
    fs::write(test_workspace.join("README.md"), "# Test Project")
        .await
        .unwrap();

    // Test validation
    let result = workspace_service
        .validate_path(&test_workspace.to_string_lossy())
        .await
        .unwrap();

    assert!(result.is_valid);
    assert_eq!(result.path, test_workspace.to_string_lossy());
    assert!(result.file_count.unwrap() > 0);
    assert!(result.workspace_name.is_some());
}

#[actix_web::test]
async fn test_workspace_validation_edge_cases() {
    let (app, temp_dir) = create_test_app().await;

    // Test with special characters in path
    let special_dir = temp_dir.path().join("test workspace with spaces");
    fs::create_dir_all(&special_dir).await.unwrap();
    fs::write(special_dir.join("Cargo.toml"), "[package]")
        .await
        .unwrap();

    let req = test::TestRequest::post()
        .uri("/v1/workspace/validate")
        .set_json(&ValidatePathRequest {
            path: special_dir.to_string_lossy().to_string(),
        })
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert!(resp.status().is_success());

    let body: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(body["is_valid"].as_bool(), Some(true));
}
