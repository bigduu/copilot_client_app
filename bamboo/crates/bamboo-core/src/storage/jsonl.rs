use std::path::{Path, PathBuf};
use tokio::fs;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use crate::agent::{Session, AgentEvent};

#[derive(Debug, Clone)]
pub struct JsonlStorage {
    base_path: PathBuf,
}

impl JsonlStorage {
    pub fn new(base_path: impl AsRef<Path>) -> Self {
        Self {
            base_path: base_path.as_ref().to_path_buf(),
        }
    }

    pub async fn init(&self) -> std::io::Result<()> {
        fs::create_dir_all(&self.base_path).await
    }

    pub async fn save_session(&self, session: &Session) -> std::io::Result<()> {
        let path = self.session_path(&session.id);
        let json = serde_json::to_string(session)?;
        fs::write(path, json).await
    }

    pub async fn load_session(&self, session_id: &str) -> std::io::Result<Option<Session>> {
        let path = self.session_path(session_id);
        if !path.exists() {
            return Ok(None);
        }
        let content = fs::read_to_string(path).await?;
        let session = serde_json::from_str(&content)?;
        Ok(Some(session))
    }

    pub async fn append_event(&self, session_id: &str, event: &AgentEvent) -> std::io::Result<()> {
        let path = self.events_path(session_id);
        let json = serde_json::to_string(event)?;
        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .await?;
        file.write_all(json.as_bytes()).await?;
        file.write_all(b"\n").await?;
        file.flush().await
    }

    pub async fn load_events(&self, session_id: &str) -> std::io::Result<Vec<AgentEvent>> {
        let path = self.events_path(session_id);
        if !path.exists() {
            return Ok(Vec::new());
        }

        let file = fs::File::open(path).await?;
        let reader = BufReader::new(file);
        let mut lines = reader.lines();
        let mut events = Vec::new();

        while let Some(line) = lines.next_line().await? {
            if let Ok(event) = serde_json::from_str(&line) {
                events.push(event);
            }
        }

        Ok(events)
    }

    fn session_path(&self, session_id: &str) -> PathBuf {
        self.base_path.join(format!("{}.json", session_id))
    }

    fn events_path(&self, session_id: &str) -> PathBuf {
        self.base_path.join(format!("{}.jsonl", session_id))
    }
}

#[async_trait::async_trait]
pub trait Storage: Send + Sync {
    async fn save_session(&self, session: &Session) -> std::io::Result<()>;
    async fn load_session(&self, session_id: &str) -> std::io::Result<Option<Session>>;
    async fn append_event(&self, session_id: &str, event: &AgentEvent) -> std::io::Result<()>;
    async fn load_events(&self, session_id: &str) -> std::io::Result<Vec<AgentEvent>>;
}

#[async_trait::async_trait]
impl Storage for JsonlStorage {
    async fn save_session(&self, session: &Session) -> std::io::Result<()> {
        self.save_session(session).await
    }

    async fn load_session(&self, session_id: &str) -> std::io::Result<Option<Session>> {
        self.load_session(session_id).await
    }

    async fn append_event(&self, session_id: &str, event: &AgentEvent) -> std::io::Result<()> {
        self.append_event(session_id, event).await
    }

    async fn load_events(&self, session_id: &str) -> std::io::Result<Vec<AgentEvent>> {
        self.load_events(session_id).await
    }
}
