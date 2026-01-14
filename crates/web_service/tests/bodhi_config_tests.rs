use actix_web::{http::StatusCode, test, web, App};
use serde_json::{json, Value};
use std::ffi::OsString;
use std::sync::{Mutex, OnceLock};
use tempfile::TempDir;
use web_service::controllers::bodhi_config_controller;

struct HomeGuard {
    previous: Option<OsString>,
}

impl HomeGuard {
    fn new(path: &std::path::Path) -> Self {
        let previous = std::env::var_os("HOME");
        std::env::set_var("HOME", path);
        Self { previous }
    }
}

impl Drop for HomeGuard {
    fn drop(&mut self) {
        match &self.previous {
            Some(value) => std::env::set_var("HOME", value),
            None => std::env::remove_var("HOME"),
        }
    }
}

fn home_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn workflow_dir(temp_dir: &TempDir) -> std::path::PathBuf {
    temp_dir.path().join(".bodhi").join("workflows")
}

#[actix_web::test]
async fn list_workflows_returns_empty_when_missing_dir() {
    let _lock = home_lock().lock().unwrap();
    let temp_dir = TempDir::new().unwrap();
    let _guard = HomeGuard::new(temp_dir.path());

    let app = test::init_service(
        App::new().service(web::scope("/v1").configure(bodhi_config_controller::config)),
    )
    .await;

    let req = test::TestRequest::get()
        .uri("/v1/bodhi/workflows")
        .to_request();
    let resp: Vec<Value> = test::call_and_read_body_json(&app, req).await;

    assert!(resp.is_empty());
}

#[actix_web::test]
async fn list_workflows_returns_markdown_metadata() {
    let _lock = home_lock().lock().unwrap();
    let temp_dir = TempDir::new().unwrap();
    let _guard = HomeGuard::new(temp_dir.path());

    let workflows_path = workflow_dir(&temp_dir);
    std::fs::create_dir_all(&workflows_path).unwrap();
    let alpha_content = "Alpha workflow\n";
    let beta_content = "Beta workflow\nSecond line\n";
    std::fs::write(workflows_path.join("beta.md"), beta_content).unwrap();
    std::fs::write(workflows_path.join("alpha.md"), alpha_content).unwrap();
    std::fs::write(workflows_path.join("ignore.txt"), "ignore").unwrap();

    let app = test::init_service(
        App::new().service(web::scope("/v1").configure(bodhi_config_controller::config)),
    )
    .await;

    let req = test::TestRequest::get()
        .uri("/v1/bodhi/workflows")
        .to_request();
    let resp: Vec<Value> = test::call_and_read_body_json(&app, req).await;

    assert_eq!(resp.len(), 2);
    assert_eq!(resp[0]["name"], "alpha");
    assert_eq!(resp[0]["filename"], "alpha.md");
    assert_eq!(resp[0]["size"].as_u64(), Some(alpha_content.len() as u64));
    assert_eq!(resp[1]["name"], "beta");
    assert_eq!(resp[1]["filename"], "beta.md");
    assert_eq!(resp[1]["size"].as_u64(), Some(beta_content.len() as u64));
}

#[actix_web::test]
async fn get_workflow_returns_content() {
    let _lock = home_lock().lock().unwrap();
    let temp_dir = TempDir::new().unwrap();
    let _guard = HomeGuard::new(temp_dir.path());

    let workflows_path = workflow_dir(&temp_dir);
    std::fs::create_dir_all(&workflows_path).unwrap();
    let content = "# Review\n\n1. Check logs.\n";
    std::fs::write(workflows_path.join("review.md"), content).unwrap();

    let app = test::init_service(
        App::new().service(web::scope("/v1").configure(bodhi_config_controller::config)),
    )
    .await;

    let req = test::TestRequest::get()
        .uri("/v1/bodhi/workflows/review")
        .to_request();
    let resp: Value = test::call_and_read_body_json(&app, req).await;

    assert_eq!(resp["name"], "review");
    assert_eq!(resp["filename"], "review.md");
    assert_eq!(resp["content"], content);
    assert_eq!(resp["size"].as_u64(), Some(content.len() as u64));
}

#[actix_web::test]
async fn get_workflow_rejects_invalid_name() {
    let _lock = home_lock().lock().unwrap();
    let temp_dir = TempDir::new().unwrap();
    let _guard = HomeGuard::new(temp_dir.path());

    let app = test::init_service(
        App::new().service(web::scope("/v1").configure(bodhi_config_controller::config)),
    )
    .await;

    let req = test::TestRequest::get()
        .uri("/v1/bodhi/workflows/..")
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
}

#[actix_web::test]
async fn get_model_mapping_returns_empty_when_missing() {
    let _lock = home_lock().lock().unwrap();
    let temp_dir = TempDir::new().unwrap();
    let _guard = HomeGuard::new(temp_dir.path());

    let app = test::init_service(
        App::new().service(web::scope("/v1").configure(bodhi_config_controller::config)),
    )
    .await;

    let req = test::TestRequest::get()
        .uri("/v1/bodhi/anthropic-model-mapping")
        .to_request();
    let resp: Value = test::call_and_read_body_json(&app, req).await;

    assert_eq!(resp, json!({ "mappings": {} }));
}

#[actix_web::test]
async fn put_model_mapping_persists() {
    let _lock = home_lock().lock().unwrap();
    let temp_dir = TempDir::new().unwrap();
    let _guard = HomeGuard::new(temp_dir.path());

    let app = test::init_service(
        App::new().service(web::scope("/v1").configure(bodhi_config_controller::config)),
    )
    .await;

    let payload = json!({
        "mappings": {
            "claude-3-5-sonnet": "gpt-4.1"
        }
    });

    let req = test::TestRequest::put()
        .uri("/v1/bodhi/anthropic-model-mapping")
        .set_json(&payload)
        .to_request();
    let resp: Value = test::call_and_read_body_json(&app, req).await;

    assert_eq!(resp, payload);

    let req = test::TestRequest::get()
        .uri("/v1/bodhi/anthropic-model-mapping")
        .to_request();
    let resp: Value = test::call_and_read_body_json(&app, req).await;

    assert_eq!(resp, payload);
}
