use crate::{error::AppError, server::AppState};
use actix_web::{get, post, web, HttpResponse};
use async_stream::stream;
use bytes::Bytes;
use claude_installer::{
    detect_npm, load_settings, mark_installed, save_settings, InstallRequest, InstallScope,
    InstallTarget, InstallerSettings,
};
use serde::Deserialize;
use std::path::PathBuf;

#[derive(Debug, Deserialize)]
struct InstallPayload {
    target: InstallTarget,
    scope: Option<InstallScope>,
    package: Option<String>,
    project_path: Option<String>,
}

#[get("/claude/install/npm/detect")]
pub async fn npm_detect(_app_state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    let result = detect_npm().await;
    Ok(HttpResponse::Ok().json(result))
}

#[get("/claude/install/settings")]
pub async fn get_settings(app_state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    let settings = load_settings(&app_state.app_data_dir)
        .await
        .map_err(|e| AppError::InternalError(anyhow::anyhow!(e.to_string())))?;
    Ok(HttpResponse::Ok().json(settings))
}

#[post("/claude/install/settings")]
pub async fn update_settings(
    app_state: web::Data<AppState>,
    payload: web::Json<InstallerSettings>,
) -> Result<HttpResponse, AppError> {
    let saved = save_settings(&app_state.app_data_dir, &payload.into_inner())
        .await
        .map_err(|e| AppError::InternalError(anyhow::anyhow!(e.to_string())))?;
    Ok(HttpResponse::Ok().json(saved))
}

#[post("/claude/install/npm/install")]
pub async fn npm_install(
    app_state: web::Data<AppState>,
    payload: web::Json<InstallPayload>,
) -> Result<HttpResponse, AppError> {
    let payload = payload.into_inner();
    let settings = load_settings(&app_state.app_data_dir)
        .await
        .map_err(|e| AppError::InternalError(anyhow::anyhow!(e.to_string())))?;
    let scope = payload.scope.unwrap_or(settings.install_scope.clone());
    let package = payload.package.unwrap_or_else(|| match &payload.target {
        InstallTarget::ClaudeCode => settings.claude_code_package.clone(),
        InstallTarget::ClaudeRouter => settings.claude_router_package.clone(),
    });
    let project_dir = payload.project_path.map(PathBuf::from);

    let handle = claude_installer::spawn_install(InstallRequest {
        package,
        scope,
        project_dir,
    })
    .await
    .map_err(|e| AppError::InternalError(anyhow::anyhow!(e.to_string())))?;

    let mut output_rx = handle.output_rx;
    let done = handle.done;
    let app_data_dir = app_state.app_data_dir.clone();
    let target = payload.target;

    let stream = stream! {
        while let Some(line) = output_rx.recv().await {
            let payload = serde_json::json!({"type": "line", "message": line});
            let chunk = format!("data: {}\n\n", payload);
            yield Ok::<Bytes, actix_web::Error>(Bytes::from(chunk));
        }

        match done.await {
            Ok(Ok(result)) => {
                if result.success {
                    let _ = mark_installed(&app_data_dir, target).await;
                }
                let payload = serde_json::json!({
                    "type": "done",
                    "success": result.success,
                    "exit_code": result.exit_code,
                });
                let chunk = format!("data: {}\n\n", payload);
                yield Ok(Bytes::from(chunk));
            }
            Ok(Err(err)) => {
                let payload = serde_json::json!({"type": "error", "message": err.to_string()});
                let chunk = format!("data: {}\n\n", payload);
                yield Ok(Bytes::from(chunk));
            }
            Err(err) => {
                let payload = serde_json::json!({"type": "error", "message": err.to_string()});
                let chunk = format!("data: {}\n\n", payload);
                yield Ok(Bytes::from(chunk));
            }
        }
    };

    Ok(HttpResponse::Ok()
        .content_type("text/event-stream")
        .streaming(stream))
}

pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(npm_detect)
        .service(get_settings)
        .service(update_settings)
        .service(npm_install);
}
