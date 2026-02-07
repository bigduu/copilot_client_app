use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::{RwLock, mpsc};
use bamboo_core::{Session, AgentEvent, storage::JsonlStorage};
use bamboo_llm::OpenAIProvider;
use bamboo_core::tools::ToolExecutor;
use bamboo_builtin_tools::BuiltinToolExecutor;
use crate::skill_loader::SkillDefinition;

pub struct AppState {
    pub sessions: Arc<RwLock<HashMap<String, Session>>>,
    pub storage: JsonlStorage,
    pub llm: Arc<dyn bamboo_llm::LLMProvider>,
    pub tools: Arc<dyn ToolExecutor>,
    pub cancel_tokens: Arc<RwLock<HashMap<String, tokio_util::sync::CancellationToken>>>,
    pub loaded_skills: Vec<SkillDefinition>,
}

impl AppState {
    #[allow(dead_code)]
    pub async fn new() -> Self {
        Self::new_with_config(
            "openai",
            "http://localhost:12123".to_string(),
            "kimi-for-coding".to_string(),
            "sk-test".to_string(),
            None,
            false,
        ).await
    }

    pub async fn new_with_config(
        provider: &str,
        llm_base_url: String,
        model: String,
        api_key: String,
        app_data_dir: Option<PathBuf>,
        tauri_mode: bool,
    ) -> Self {
        let data_dir = match app_data_dir {
            Some(dir) => dir,
            None => {
                if tauri_mode {
                    bodhi_dir().join("bamboo")
                } else {
                    dirs::home_dir()
                        .unwrap_or_else(|| std::env::temp_dir())
                        .join(".bamboo")
                }
            }
        };
        
        let storage = JsonlStorage::new(&data_dir);
        storage.init().await.expect("Failed to init storage");
        
        // 根据 provider 初始化 LLM Provider
        log::info!("Creating LLM provider: {} with base URL: {} and model: {}", provider, llm_base_url, model);
        
        let llm: Arc<dyn bamboo_llm::LLMProvider> = match provider {
            "copilot" => {
                log::info!("Using Copilot provider with Device Code authentication");
                
                // Create Copilot provider and authenticate
                let mut copilot_provider = if api_key != "sk-test" && !api_key.is_empty() {
                    // Use provided API key directly
                    bamboo_llm::CopilotProvider::with_token(api_key)
                } else {
                    // Use device code flow
                    bamboo_llm::CopilotProvider::new()
                };
                
                // Try silent auth first (cached token)
                if !copilot_provider.is_authenticated() {
                    match copilot_provider.try_authenticate_silent().await {
                        Ok(true) => {
                            log::info!("Authenticated with cached Copilot token");
                        }
                        Ok(false) => {
                            println!("\n⚠️  Copilot authentication required");
                            // Run interactive device code flow
                            if let Err(e) = copilot_provider.authenticate().await {
                                log::error!("Failed to authenticate with Copilot: {}", e);
                                panic!("Copilot authentication failed: {}. Please try again.", e);
                            }
                        }
                        Err(e) => {
                            log::error!("Authentication error: {}", e);
                            panic!("Copilot authentication error: {}", e);
                        }
                    }
                }
                
                Arc::new(copilot_provider)
            }
            _ => {
                log::info!("Using OpenAI provider");
                Arc::new(
                    OpenAIProvider::new(api_key)
                        .with_base_url(llm_base_url)
                        .with_model(model)
                )
            }
        };

        let tools: Arc<dyn ToolExecutor> = Arc::new(BuiltinToolExecutor::new());
        
        // 加载 skills
        let skill_loader = crate::skill_loader::SkillLoader::with_dir(data_dir.join("skills"));
        let loaded_skills: Vec<crate::skill_loader::SkillDefinition> =
            skill_loader.load_skills().await;
        
        if !loaded_skills.is_empty() {
            log::info!("Loaded {} skills", loaded_skills.len());
            for skill in &loaded_skills {
                log::info!("  - {}: {}", skill.id, skill.name);
            }
        }
        
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            storage,
            llm,
            tools,
            cancel_tokens: Arc::new(RwLock::new(HashMap::new())),
            loaded_skills,
        }
    }

    #[allow(dead_code)]
    pub async fn save_event(&self, session_id: &str, event: &AgentEvent) {
        let _ = self.storage.append_event(session_id, event).await;
    }

    pub async fn save_session(&self, session: &Session) {
        let _ = self.storage.save_session(session).await;
    }
    
    /// Get all tool schemas from the built-in tool executor
    pub fn get_all_tool_schemas(&self) -> Vec<bamboo_core::tools::ToolSchema> {
        self.tools.list_tools()
    }
    
    /// Build system prompt with skills context
    pub fn build_system_prompt(&self, base_prompt: &str) -> String {
        crate::skill_loader::SkillLoader::build_system_prompt(base_prompt, &self.loaded_skills)
    }
}

fn bodhi_dir() -> PathBuf {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::temp_dir())
        .join(".bodhi")
}

/// 启动 SSE 流发送器
pub fn spawn_sse_sender(
    mut rx: mpsc::Receiver<AgentEvent>,
    tx: mpsc::Sender<actix_web::web::Bytes>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        while let Some(event) = rx.recv().await {
            let event_json = match serde_json::to_string(&event) {
                Ok(json) => json,
                Err(_) => continue,
            };
            
            let sse_data = format!("data: {}\n\n", event_json);
            let bytes = actix_web::web::Bytes::from(sse_data);
            
            if tx.send(bytes).await.is_err() {
                break;
            }
            
            // 如果是 Complete 或 Error 事件，结束流
            match &event {
                AgentEvent::Complete { .. } | AgentEvent::Error { .. } => {
                    break;
                }
                _ => {}
            }
        }
    })
}
