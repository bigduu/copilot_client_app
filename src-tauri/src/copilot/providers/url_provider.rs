use llm_proxy_core::{Error, UrlProvider};

pub struct CopilotUrlProvider {
    base_url: String,
}

impl Default for CopilotUrlProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl CopilotUrlProvider {
    pub fn new() -> Self {
        Self {
            base_url: "https://api.githubcopilot.com/chat/completions".into(),
        }
    }
}

impl UrlProvider for CopilotUrlProvider {
    fn get_url(&self) -> Result<String, Error> {
        Ok(self.base_url.clone())
    }
}

