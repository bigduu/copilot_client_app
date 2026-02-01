use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use crate::agent::{Session, Message, AgentEvent, events::TokenUsage};
use crate::tools::ToolExecutor;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AgentError {
    #[error("Session not found: {0}")]
    SessionNotFound(String),
    
    #[error("LLM error: {0}")]
    LLM(String),
    
    #[error("Tool error: {0}")]
    Tool(String),
    
    #[error("Cancelled")]
    Cancelled,
}

pub type Result<T> = std::result::Result<T, AgentError>;

pub struct AgentConfig {
    pub max_rounds: usize,
    pub model: String,
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            max_rounds: 3,
            model: "gpt-4o-mini".to_string(),
        }
    }
}

pub struct AgentLoop<E: ToolExecutor> {
    config: AgentConfig,
    tool_executor: E,
}

impl<E: ToolExecutor> AgentLoop<E> {
    pub fn new(config: AgentConfig, tool_executor: E) -> Self {
        Self {
            config,
            tool_executor,
        }
    }

    pub async fn run(
        &self,
        session: &mut Session,
        initial_message: String,
        event_tx: mpsc::Sender<AgentEvent>,
        cancel_token: CancellationToken,
    ) -> Result<()> {
        // 添加用户消息
        session.add_message(Message::user(initial_message));
        
        for _round in 0..self.config.max_rounds {
            // 检查取消
            if cancel_token.is_cancelled() {
                return Err(AgentError::Cancelled);
            }

            // TODO: Phase 2 实现 LLM 调用
            // TODO: Phase 3 实现工具执行
            
            // 临时：直接发送完成事件
            event_tx.send(AgentEvent::Complete {
                usage: TokenUsage {
                    prompt_tokens: 10,
                    completion_tokens: 10,
                    total_tokens: 20,
                },
            }).await.map_err(|e| AgentError::LLM(e.to_string()))?;
            
            break;
        }

        Ok(())
    }
}
