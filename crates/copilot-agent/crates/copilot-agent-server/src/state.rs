use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{RwLock, mpsc};
use copilot_agent_core::{Session, AgentEvent, storage::JsonlStorage};
use copilot_agent_llm::OpenAIProvider;
use copilot_agent_core::tools::ToolExecutor;
use crate::skill_loader::{SkillLoader, SkillDefinition};

pub struct AppState {
    pub sessions: Arc<RwLock<HashMap<String, Session>>>,
    pub storage: JsonlStorage,
    pub llm: Arc<dyn copilot_agent_llm::LLMProvider>,
    pub tools: Arc<dyn ToolExecutor>,
    pub cancel_tokens: Arc<RwLock<HashMap<String, tokio_util::sync::CancellationToken>>>,
    pub skill_loader: SkillLoader,
    pub loaded_skills: Vec<SkillDefinition>,
}

impl AppState {
    pub async fn new() -> Self {
        Self::new_with_config(
            "http://localhost:12123".to_string(),
            "kimi-for-coding".to_string(),
            "sk-test".to_string(),
        ).await
    }

    pub async fn new_with_config(
        llm_base_url: String,
        model: String,
        api_key: String,
    ) -> Self {
        let data_dir = dirs::home_dir()
            .unwrap_or_else(|| std::env::temp_dir())
            .join(".copilot-agent");
        
        let storage = JsonlStorage::new(&data_dir);
        storage.init().await.expect("Failed to init storage");
        
        // 初始化 OpenAI Provider（使用配置参数）
        log::info!("Creating LLM provider with base URL: {} and model: {}", llm_base_url, model);
        let llm: Arc<dyn copilot_agent_llm::LLMProvider> = Arc::new(
            OpenAIProvider::new(api_key)
                .with_base_url(llm_base_url)
                .with_model(model)
        );

        // 初始化工具（使用 MCP 客户端）
        let tools: Arc<dyn ToolExecutor> = Arc::new(
            copilot_agent_mcp::McpClient::new()
        );
        
        // 加载 skills
        let skill_loader = crate::skill_loader::SkillLoader::new();
        let loaded_skills: Vec<crate::skill_loader::SkillDefinition> = skill_loader.load_skills().await;
        
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
            skill_loader,
            loaded_skills,
        }
    }

    pub async fn save_event(&self, session_id: &str, event: &AgentEvent) {
        let _ = self.storage.append_event(session_id, event).await;
    }

    pub async fn save_session(&self, session: &Session) {
        let _ = self.storage.save_session(session).await;
    }
    
    /// Get all tool schemas including base tools and skill-associated tools
    pub fn get_all_tool_schemas(&self) -> Vec<copilot_agent_core::tools::ToolSchema> {
        let mut schemas = self.tools.list_tools();
        
        // Add skill-associated tool schemas
        let skill_schemas = crate::skill_loader::SkillLoader::get_skill_tool_schemas(&self.loaded_skills);
        schemas.extend(skill_schemas);
        
        schemas
    }
    
    /// Build system prompt with skills context
    pub fn build_system_prompt(&self, base_prompt: &str) -> String {
        crate::skill_loader::SkillLoader::build_system_prompt(base_prompt, &self.loaded_skills)
    }
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
