use anyhow::{anyhow, Result};
use log::{error, info, warn};
use reqwest::{Client, IntoUrl, Method, Response};
use serde::Serialize;
use std::sync::Arc;

/// Executes an HTTP request with common configurations and error handling.
pub async fn execute_request<T: Serialize + ?Sized>(
    client: &Arc<Client>,
    method: Method,
    url: impl IntoUrl,
    auth_token: Option<&str>,
    json_body: Option<&T>,
) -> Result<Response> {
    let url_val = url.into_url()?;
    let mut request_builder = client.request(method.clone(), url_val.clone());

    if let Some(token) = auth_token {
        request_builder = request_builder.header("Authorization", format!("Bearer {}", token));
    }

    let mut add_content_type = false;
    if json_body.is_some() {
        if let Some(cloned_builder) = request_builder.try_clone() {
            match cloned_builder.build() {
                Ok(req) => {
                    if req.method() == Method::POST || req.method() == Method::PUT {
                        add_content_type = true;
                    }
                }
                Err(e) => {
                    warn!(
                        "Could not build request to check method for Content-Type: {}",
                        e
                    );
                }
            }
        } else {
            warn!("Could not clone request builder to check method for Content-Type");
        }
    }
    if add_content_type {
        request_builder = request_builder.header("Content-Type", "application/json");
    }

    if let Some(body) = json_body {
        request_builder = request_builder.json(body);
    }

    let http_method_for_log = method.as_str();
    info!("Sending {} request to {}", http_method_for_log, url_val);
    let start_time = std::time::Instant::now();

    match request_builder.send().await {
        Ok(resp) => {
            info!(
                "Got response from {} after {:?} with status {}",
                url_val,
                start_time.elapsed(),
                resp.status()
            );
            Ok(resp)
        }
        Err(e) => {
            let error_msg = format!("Failed HTTP request to {}: {}", url_val, e);
            error!("{}", error_msg);
            Err(anyhow!(error_msg))
        }
    }
}
