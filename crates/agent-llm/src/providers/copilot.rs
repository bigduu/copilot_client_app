use async_trait::async_trait;
use eventsource_stream::Eventsource;
use futures::StreamExt;
use reqwest::Client;
use serde::Deserialize;
use serde_json::json;

use crate::auth::{
    get_copilot_token, get_device_code, poll_access_token, present_device_code, TokenCache,
};
use crate::provider::{LLMError, LLMProvider, LLMStream, Result};
use crate::types::LLMChunk;
use agent_core::{tools::FunctionCall, tools::ToolCall, tools::ToolSchema, Message};

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

    /// Convert internal Message to Copilot API format
    fn convert_messages(&self, messages: &[Message]) -> Vec<serde_json::Value> {
        messages
            .iter()
            .map(|m| {
                let role = match m.role {
                    agent_core::agent::Role::System => "system",
                    agent_core::agent::Role::User => "user",
                    agent_core::agent::Role::Assistant => "assistant",
                    agent_core::agent::Role::Tool => "tool",
                };

                let mut msg = json!({
                    "role": role,
                    "content": m.content,
                });

                // Add tool_call_id for tool messages
                if let Some(ref tool_call_id) = m.tool_call_id {
                    msg["tool_call_id"] = json!(tool_call_id);
                }

                // Add tool_calls for assistant messages
                if let Some(ref tool_calls) = m.tool_calls {
                    msg["tool_calls"] = json!(tool_calls
                        .iter()
                        .map(|tc| {
                            json!({
                                "id": tc.id,
                                "type": tc.tool_type,
                                "function": {
                                    "name": tc.function.name,
                                    "arguments": tc.function.arguments,
                                }
                            })
                        })
                        .collect::<Vec<_>>());
                }

                msg
            })
            .collect()
    }

    /// Convert ToolSchema to Copilot API format
    fn convert_tools(&self, tools: &[ToolSchema]) -> Vec<serde_json::Value> {
        tools
            .iter()
            .map(|t| {
                json!({
                    "type": "function",
                    "function": {
                        "name": t.function.name,
                        "description": t.function.description,
                        "parameters": t.function.parameters,
                    }
                })
            })
            .collect()
    }
}

impl Default for CopilotProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl LLMProvider for CopilotProvider {
    async fn chat_stream(&self, messages: &[Message], tools: &[ToolSchema]) -> Result<LLMStream> {
        // Ensure authenticated
        if !self.is_authenticated() {
            return Err(LLMError::Auth(
                "Not authenticated. Please run authenticate() first.".to_string(),
            ));
        }

        let body = json!({
            "model": "copilot-chat",
            "messages": self.convert_messages(messages),
            "stream": true,
            "tools": self.convert_tools(tools),
            "tool_choice": "auto",
        });

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

        let stream = response
            .bytes_stream()
            .eventsource()
            .map(|event| {
                let event = event.map_err(|e| LLMError::Stream(e.to_string()))?;

                if event.data == "[DONE]" {
                    return Ok(LLMChunk::Done);
                }

                // Handle potential JSON parsing errors gracefully
                let chunk: CopilotChunk = match serde_json::from_str(&event.data) {
                    Ok(c) => c,
                    Err(e) => {
                        log::warn!(
                            "Failed to parse Copilot chunk: {} - data: {}",
                            e,
                            event.data
                        );
                        return Ok(LLMChunk::Token(String::new()));
                    }
                };

                parse_chunk(chunk)
            })
            .filter_map(|result| async move {
                match result {
                    Ok(LLMChunk::Done) => None,
                    Ok(chunk) => Some(Ok(chunk)),
                    Err(e) => Some(Err(e)),
                }
            });

        Ok(Box::pin(stream))
    }
}

/// Copilot SSE chunk format
#[derive(Debug, Deserialize)]
struct CopilotChunk {
    choices: Vec<CopilotChoice>,
}

#[derive(Debug, Deserialize)]
struct CopilotChoice {
    delta: CopilotDelta,
    #[allow(dead_code)]
    #[serde(rename = "finish_reason")]
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
struct CopilotDelta {
    content: Option<String>,
    #[serde(rename = "tool_calls")]
    tool_calls: Option<Vec<CopilotToolCall>>,
    #[allow(dead_code)]
    role: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CopilotToolCall {
    #[allow(dead_code)]
    index: usize,
    id: Option<String>,
    #[serde(rename = "type")]
    tool_type: Option<String>,
    function: Option<CopilotFunction>,
}

#[derive(Debug, Deserialize)]
struct CopilotFunction {
    name: Option<String>,
    arguments: Option<String>,
}

/// Parse Copilot chunk into LLMChunk
fn parse_chunk(chunk: CopilotChunk) -> Result<LLMChunk> {
    if let Some(choice) = chunk.choices.first() {
        let delta = &choice.delta;

        // Handle tool calls
        if let Some(tool_calls) = &delta.tool_calls {
            let calls: Vec<ToolCall> = tool_calls
                .iter()
                .map(|tc| ToolCall {
                    id: tc.id.clone().unwrap_or_default(),
                    tool_type: tc
                        .tool_type
                        .clone()
                        .unwrap_or_else(|| "function".to_string()),
                    function: FunctionCall {
                        name: tc
                            .function
                            .as_ref()
                            .and_then(|f| f.name.clone())
                            .unwrap_or_default(),
                        arguments: tc
                            .function
                            .as_ref()
                            .and_then(|f| f.arguments.clone())
                            .unwrap_or_default(),
                    },
                })
                .collect();

            if !calls.is_empty() {
                return Ok(LLMChunk::ToolCalls(calls));
            }
        }

        // Handle content
        if let Some(content) = &delta.content {
            return Ok(LLMChunk::Token(content.clone()));
        }
    }

    Ok(LLMChunk::Token(String::new()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_provider() {
        let provider = CopilotProvider::new();
        assert!(!provider.is_authenticated());
    }

    #[test]
    fn test_with_token() {
        let provider = CopilotProvider::with_token("test_token");
        assert!(provider.is_authenticated());
        assert_eq!(provider.token(), Some("test_token"));
    }

    #[test]
    fn test_convert_messages() {
        let provider = CopilotProvider::new();
        let messages = vec![
            agent_core::Message::system("You are helpful"),
            agent_core::Message::user("Hello"),
        ];

        let converted = provider.convert_messages(&messages);
        assert_eq!(converted.len(), 2);
        assert_eq!(converted[0]["role"], "system");
        assert_eq!(converted[1]["role"], "user");
    }
}
