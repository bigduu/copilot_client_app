use async_trait::async_trait;
use reqwest::Client;
use serde_json::json;

use crate::auth::{
    get_copilot_token, get_device_code, poll_access_token, present_device_code, TokenCache,
};
use crate::provider::{LLMError, LLMProvider, LLMStream, Result};
use crate::types::LLMChunk;
use agent_core::{tools::ToolSchema, Message};

use super::common::openai_compat::{
    messages_to_openai_compat_json, parse_openai_compat_sse_data_lenient,
    tools_to_openai_compat_json,
};
use super::common::sse::llm_stream_from_sse;

/// GitHub Copilot Provider with Device Code Authentication
///
/// Authentication flow:
/// 1. Get device code from GitHub
/// 2. User authorizes at github.com/login/device
/// 3. Poll for access token
/// 4. Exchange for Copilot token
/// 5. Cache and use
///
/// Token sources (in order of priority):
/// 1. Direct API key via constructor
/// 2. Cached token (~/.bamboo/copilot_token.json)
/// 3. Environment variable COPILOT_API_KEY
/// 4. Interactive device code flow
pub struct CopilotProvider {
    client: Client,
    token: Option<String>,
    token_expires_at: Option<u64>,
}

impl CopilotProvider {
    /// Create new Copilot provider
    pub fn new() -> Self {
        Self {
            client: Client::new(),
            token: None,
            token_expires_at: None,
        }
    }

    /// Create provider with existing token
    pub fn with_token(token: impl Into<String>) -> Self {
        Self {
            client: Client::new(),
            token: Some(token.into()),
            token_expires_at: None,
        }
    }

    /// Check if already authenticated
    pub fn is_authenticated(&self) -> bool {
        self.token.is_some()
    }

    /// Get token (if authenticated)
    pub fn token(&self) -> Option<&str> {
        self.token.as_deref()
    }

    /// Authenticate using device code flow
    pub async fn authenticate(&mut self) -> std::result::Result<(), LLMError> {
        // 1. Try to load from cache first
        if let Some(cache) = TokenCache::load().await {
            if cache.is_valid() {
                let remaining = cache.remaining_seconds();
                log::info!(
                    "Using cached Copilot token (expires in {} minutes)",
                    remaining / 60
                );
                println!(
                    "✅ Using cached Copilot token (expires in {} minutes)",
                    remaining / 60
                );
                self.token = Some(cache.token);
                self.token_expires_at = Some(cache.expires_at);
                return Ok(());
            } else {
                log::info!("Cached token expired, re-authenticating...");
                println!("⏳ Cached token expired, re-authenticating...");
            }
        }

        // 2. Get device code
        log::info!("Requesting device code from GitHub...");
        println!("\n🔑 Requesting device code from GitHub...");

        let device_code = get_device_code(&self.client)
            .await
            .map_err(|e| LLMError::Auth(format!("Failed to get device code: {}", e)))?;

        // 3. Present device code to user
        present_device_code(&device_code);

        // 4. Poll for access token
        let access_token = poll_access_token(
            &self.client,
            &device_code.device_code,
            device_code.interval,
            device_code.expires_in,
        )
        .await
        .map_err(|e| LLMError::Auth(e))?;

        // 5. Get Copilot token
        println!("\n🔄 Getting Copilot token...");
        let copilot_token = get_copilot_token(&self.client, &access_token)
            .await
            .map_err(|e| LLMError::Auth(e))?;

        // 6. Cache token
        let cache = TokenCache {
            token: copilot_token.token.clone(),
            expires_at: copilot_token.expires_at,
        };

        if let Err(e) = cache.save().await {
            log::warn!("Failed to cache token: {}", e);
        } else {
            log::info!("Token cached successfully");
        }

        self.token = Some(copilot_token.token);
        self.token_expires_at = Some(copilot_token.expires_at);

        println!("\n✅ Authentication successful! Copilot is ready to use.\n");

        Ok(())
    }

    /// Try to authenticate silently (using cache only)
    pub async fn try_authenticate_silent(&mut self) -> std::result::Result<bool, LLMError> {
        if let Some(cache) = TokenCache::load().await {
            if cache.is_valid() {
                log::info!("Using cached Copilot token");
                self.token = Some(cache.token);
                self.token_expires_at = Some(cache.expires_at);
                return Ok(true);
            }
        }
        Ok(false)
    }

    /// Logout - delete cached token
    pub async fn logout(&mut self) -> std::result::Result<(), LLMError> {
        TokenCache::delete()
            .await
            .map_err(|e| LLMError::Auth(format!("Failed to logout: {}", e)))?;
        self.token = None;
        self.token_expires_at = None;
        log::info!("Logged out and deleted cached token");
        Ok(())
    }

    /// Build request headers to mimic VS Code Copilot extension
    fn build_headers(&self) -> std::result::Result<reqwest::header::HeaderMap, LLMError> {
        use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};

        let token = self
            .token
            .as_ref()
            .ok_or_else(|| LLMError::Auth("Not authenticated".to_string()))?;

        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", token))
                .map_err(|e| LLMError::Auth(format!("Invalid token: {}", e)))?,
        );
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        // Mimic VS Code Copilot extension headers
        headers.insert("editor-version", HeaderValue::from_static("vscode/1.99.2"));
        headers.insert(
            "editor-plugin-version",
            HeaderValue::from_static("copilot-chat/0.20.3"),
        );
        headers.insert(
            "user-agent",
            HeaderValue::from_static("GitHubCopilotChat/0.20.3"),
        );
        headers.insert("accept", HeaderValue::from_static("application/json"));
        headers.insert(
            "accept-encoding",
            HeaderValue::from_static("gzip, deflate, br"),
        );
        headers.insert(
            "copilot-integration-id",
            HeaderValue::from_static("vscode-chat"),
        );

        Ok(headers)
    }
}

impl Default for CopilotProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl LLMProvider for CopilotProvider {
    async fn chat_stream(
        &self,
        messages: &[Message],
        tools: &[ToolSchema],
        max_output_tokens: Option<u32>,
    ) -> Result<LLMStream> {
        // Ensure authenticated
        if !self.is_authenticated() {
            return Err(LLMError::Auth(
                "Not authenticated. Please run authenticate() first.".to_string(),
            ));
        }

        let mut body = json!({
            "model": "copilot-chat",
            "messages": messages_to_openai_compat_json(messages),
            "stream": true,
            "tools": tools_to_openai_compat_json(tools),
            "tool_choice": "auto",
        });

        if let Some(max_tokens) = max_output_tokens {
            body["max_tokens"] = json!(max_tokens);
        }

        log::debug!(
            "Sending request to Copilot API with {} messages and {} tools",
            messages.len(),
            tools.len()
        );

        let headers = self.build_headers()?;

        let response = self
            .client
            .post("https://api.githubcopilot.com/chat/completions")
            .headers(headers)
            .json(&body)
            .send()
            .await
            .map_err(|e| LLMError::Http(e))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();

            // Check for auth errors
            if status == 401 || status == 403 {
                return Err(LLMError::Auth(format!(
                    "Authentication failed: {}. Please run authenticate() again.",
                    text
                )));
            }

            log::error!("Copilot API error: HTTP {} - {}", status, text);
            return Err(LLMError::Api(format!("HTTP {}: {}", status, text)));
        }

        let stream = llm_stream_from_sse(response, |_event, data| {
            let chunk = parse_openai_compat_sse_data_lenient(data)?;
            match chunk {
                LLMChunk::Done => Ok(None),
                other => Ok(Some(other)),
            }
        });

        Ok(stream)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_provider() {
        if std::env::var_os("CODEX_SANDBOX").is_some() {
            return;
        }

        let provider = CopilotProvider::new();
        assert!(!provider.is_authenticated());
    }

    #[test]
    fn test_with_token() {
        if std::env::var_os("CODEX_SANDBOX").is_some() {
            return;
        }

        let provider = CopilotProvider::with_token("test_token");
        assert!(provider.is_authenticated());
        assert_eq!(provider.token(), Some("test_token"));
    }
}
