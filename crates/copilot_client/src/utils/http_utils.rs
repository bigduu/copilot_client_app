use anyhow::{anyhow, Result};
use log::{error, info, warn};
use reqwest::{Client, IntoUrl, Method, Response};
use serde::Serialize;
use std::error::Error;
use std::sync::Arc;

/// Executes an HTTP request with common configurations and error handling.
/// Note: Retry logic is now handled by reqwest-retry middleware at the client level.
pub async fn execute_request<T: Serialize + ?Sized>(
    client: &Arc<Client>,
    method: Method,
    url: impl IntoUrl,
    auth_token: Option<&str>,
    json_body: Option<&T>,
) -> Result<Response> {
    execute_request_with_vision(client, method, url, auth_token, json_body, false).await
}

/// Executes an HTTP request with vision support for GitHub Copilot API.
/// Note: Retry logic is now handled by reqwest-retry middleware at the client level.
pub async fn execute_request_with_vision<T: Serialize + ?Sized>(
    client: &Arc<Client>,
    method: Method,
    url: impl IntoUrl,
    auth_token: Option<&str>,
    json_body: Option<&T>,
    has_images: bool,
) -> Result<Response> {
    let url_val = url.into_url()?;
    let mut request_builder = client.request(method.clone(), url_val.clone());

    if let Some(token) = auth_token {
        request_builder = request_builder.header("Authorization", format!("Bearer {}", token));
    }

    // Add vision header if images are present
    if has_images {
        request_builder = request_builder.header("copilot-vision-request", "true");
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

    // Log request details for debugging
    if let Some(cloned_builder) = request_builder.try_clone() {
        match cloned_builder.build() {
            Ok(req) => {
                info!("Request headers: {:?}", req.headers());
                if req.body().is_some() {
                    info!("Request has body");
                }
            }
            Err(e) => {
                warn!("Could not build request for logging: {}", e);
            }
        }
    }

    let start_time = std::time::Instant::now();

    match request_builder.send().await {
        Ok(resp) => {
            info!(
                "Got response from {} after {:?} with status {}",
                url_val,
                start_time.elapsed(),
                resp.status()
            );

            // Log response headers for debugging
            info!("Response headers: {:?}", resp.headers());

            Ok(resp)
        }
        Err(e) => {
            let error_msg = format!("Failed HTTP request to {}: {}", url_val, e);
            error!("{}", error_msg);

            // Log detailed error information
            error!("Error details: {:?}", e);
            if let Some(source) = e.source() {
                error!("Error source: {:?}", source);
            }

            // Check for specific error types
            if e.is_timeout() {
                error!("Request timed out");
            }
            if e.is_connect() {
                error!("Connection error");
            }
            if e.is_request() {
                error!("Request error");
            }
            if e.is_body() {
                error!("Body error");
            }
            if e.is_decode() {
                error!("Decode error");
            }

            Err(anyhow!(error_msg))
        }
    }
}
