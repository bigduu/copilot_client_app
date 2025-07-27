//! Proxy Service
//!
//! Handles company proxy configuration for network requests.

use serde::{Deserialize, Serialize};

/// Proxy configuration for company network
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyConfig {
    pub http_proxy: Option<String>,
    pub https_proxy: Option<String>,
    pub no_proxy: Option<String>,
    pub auth_required: bool,
}

impl ProxyConfig {
    /// Create a new proxy configuration
    pub fn new() -> Self {
        Self {
            http_proxy: None,
            https_proxy: None,
            no_proxy: None,
            auth_required: false,
        }
    }

    /// Load proxy configuration from environment or config file
    pub fn from_environment() -> Option<Self> {
        if std::env::var("COMPANY_INTERNAL").unwrap_or_default() == "true" {
            Some(Self {
                http_proxy: std::env::var("HTTP_PROXY").ok(),
                https_proxy: std::env::var("HTTPS_PROXY").ok(),
                no_proxy: std::env::var("NO_PROXY").ok(),
                auth_required: std::env::var("PROXY_AUTH_REQUIRED")
                    .map(|v| v.to_lowercase() == "true")
                    .unwrap_or(false),
            })
        } else {
            None
        }
    }

    /// Apply proxy configuration to reqwest client builder
    pub fn apply_to_client(&self, builder: reqwest::ClientBuilder) -> reqwest::ClientBuilder {
        let mut builder = builder;

        if let Some(proxy_url) = &self.http_proxy {
            if let Ok(proxy) = reqwest::Proxy::http(proxy_url) {
                builder = builder.proxy(proxy);
            }
        }

        if let Some(proxy_url) = &self.https_proxy {
            if let Ok(proxy) = reqwest::Proxy::https(proxy_url) {
                builder = builder.proxy(proxy);
            }
        }

        builder
    }

    /// Check if a URL should bypass proxy
    pub fn should_bypass(&self, url: &str) -> bool {
        if let Some(no_proxy) = &self.no_proxy {
            for pattern in no_proxy.split(',') {
                let pattern = pattern.trim();
                if pattern.is_empty() {
                    continue;
                }

                if pattern.starts_with('.') {
                    // Domain suffix match
                    if url.contains(pattern) {
                        return true;
                    }
                } else if url.contains(pattern) {
                    // Exact match
                    return true;
                }
            }
        }
        false
    }
}
