//! Internal Services Module
//!
//! This module contains all company-specific services like proxy settings,
//! authentication services, etc.

use std::sync::Arc;
use tauri::{App, Manager, Runtime};
use tokio::sync::Mutex;

pub mod auth;
pub mod proxy;

// Re-exports
pub use auth::*;
pub use proxy::*;

/// Company-specific service state
#[derive(Debug)]
pub struct CompanyServices {
    pub proxy_config: Option<ProxyConfig>,
    pub auth_service: Option<Arc<Mutex<AuthService>>>,
}

impl CompanyServices {
    pub fn new() -> Self {
        Self {
            proxy_config: None,
            auth_service: None,
        }
    }
}

/// Setup all company-specific services (synchronous version)
///
/// This function initializes and registers all internal services with the Tauri app.
/// It's called during app setup when the internal feature is enabled.
pub fn setup_company_services_sync<R: Runtime>(
    app: &mut App<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    log::info!("Setting up company services...");

    // Initialize proxy configuration
    let proxy_config = setup_proxy_config_sync()?;

    // Create company services state (auth service will be initialized later)
    let company_services = CompanyServices {
        proxy_config: Some(proxy_config),
        auth_service: None, // Will be initialized asynchronously later
    };

    // Register with Tauri state management
    app.manage(company_services);

    // Initialize auth service asynchronously
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        if let Ok(auth_service) = setup_auth_service().await {
            // Note: In a real implementation, you'd need to update the managed state
            log::info!("Authentication service initialized asynchronously");
        }
    });

    log::info!("Company services setup completed");
    Ok(())
}

/// Setup all company-specific services (async version)
///
/// This function initializes and registers all internal services with the Tauri app.
/// It's called during app setup when the internal feature is enabled.
pub async fn setup_company_services<R: Runtime>(
    app: &mut App<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    log::info!("Setting up company services...");

    // Initialize proxy configuration
    let proxy_config = setup_proxy_config().await?;

    // Initialize authentication service
    let auth_service = setup_auth_service().await?;

    // Create company services state
    let company_services = CompanyServices {
        proxy_config: Some(proxy_config),
        auth_service: Some(Arc::new(Mutex::new(auth_service))),
    };

    // Register with Tauri state management
    app.manage(company_services);

    log::info!("Company services setup completed");
    Ok(())
}

/// Setup proxy configuration for company network (synchronous version)
fn setup_proxy_config_sync() -> Result<ProxyConfig, Box<dyn std::error::Error>> {
    // TODO: Load from company configuration
    let config = ProxyConfig {
        http_proxy: Some("http://proxy.company.com:8080".to_string()),
        https_proxy: Some("https://proxy.company.com:8080".to_string()),
        no_proxy: Some("localhost,127.0.0.1,.company.com".to_string()),
        auth_required: true,
    };

    log::info!("Proxy configuration loaded");
    Ok(config)
}

/// Setup proxy configuration for company network
async fn setup_proxy_config() -> Result<ProxyConfig, Box<dyn std::error::Error>> {
    // TODO: Load from company configuration
    let config = ProxyConfig {
        http_proxy: Some("http://proxy.company.com:8080".to_string()),
        https_proxy: Some("https://proxy.company.com:8080".to_string()),
        no_proxy: Some("localhost,127.0.0.1,.company.com".to_string()),
        auth_required: true,
    };

    log::info!("Proxy configuration loaded");
    Ok(config)
}

/// Setup authentication service for company systems
async fn setup_auth_service() -> Result<AuthService, Box<dyn std::error::Error>> {
    let auth_service = AuthService::new().await?;
    log::info!("Authentication service initialized");
    Ok(auth_service)
}
