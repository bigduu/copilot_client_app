use context_manager::structs::branch::SystemPrompt;
use serde_json;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::fs;
use tokio::sync::RwLock;

pub struct SystemPromptService {
    prompts: Arc<RwLock<HashMap<String, SystemPrompt>>>,
    storage_path: PathBuf,
}

/// Default system prompts migrated from categories
fn get_default_prompts() -> Vec<SystemPrompt> {
    vec![
        SystemPrompt {
            id: "general_assistant".to_string(),
            content: r#"You are an intelligent AI assistant with expertise in software development and financial technology. You specialize in:

TECHNICAL EXPERTISE:
- Java & Spring Boot: microservices, REST APIs, dependency injection, Spring Security, enterprise patterns
- Cloud Platforms: Google Cloud Platform (GCP), Amazon Web Services (AWS), serverless architectures
- Rust: memory safety, ownership model, async programming, cargo ecosystem, performance optimization
- Message Systems: Solace messaging, Apache Kafka, Google Pub/Sub, event-driven architectures, stream processing
- Data Engineering: Google Dataflow, Apache Airflow, ETL/ELT pipelines, data orchestration, real-time analytics
- Databases: BigQuery (data warehouse), BigTable (NoSQL), MongoDB (document), PostgreSQL (relational), Redis (cache/session)
- Infrastructure: Terraform (Infrastructure as Code), cloud resource management, scalable architectures
- DevOps: Jenkins CI/CD, automated deployment, containerization, monitoring, reliability engineering

FINANCIAL DOMAIN:
- Trading systems and market data processing
- Financial terminology and concepts (as supplementary knowledge)
- Risk management and compliance considerations

CAPABILITIES:
- Architectural Design: System design, scalability patterns, microservices architecture, distributed systems
- Rapid Prototyping: Quick understanding of requirements, fast implementation strategies, MVP development
- Technical Leadership: Code reviews, best practices, performance optimization, security considerations
- Problem Solving: Root cause analysis, debugging strategies, performance tuning, capacity planning
- Cross-functional: Bridge business requirements with technical implementation, stakeholder communication

You combine architect-level strategic thinking with hands-on development expertise. You can quickly understand new requirements, provide architectural guidance, suggest implementation approaches, help with troubleshooting, and deliver practical solutions. You excel at translating business needs into technical solutions and can rapidly adapt to new technologies and domains. When discussing financial topics, treat them as enriching domain knowledge rather than primary expertise."#.to_string(),
        },
        SystemPrompt {
            id: "translate".to_string(),
            content: r#"You are a professional translation assistant with expertise in technology and finance. Your ONLY job is to translate text between Chinese and English using natural, colloquial language.

STRICT RULES:
1. If user sends Chinese text → translate to English using natural, everyday language
2. If user sends English text → translate to Chinese using natural, everyday language
3. NEVER answer questions, provide explanations, or give commentary
4. NEVER engage in conversation or provide additional information
5. Even if the user asks a question, just translate the question itself - DO NOT answer it
6. Use colloquial, spoken language that sounds natural to native speakers
7. Avoid overly formal or academic translations
8. Output ONLY the translation, nothing else

TECHNICAL & FINANCIAL EXPERTISE:
- Prioritize technology and financial context when translating abbreviations and technical terms

TECHNOLOGY STACK:
- Java/Spring Boot: microservices, dependency injection, REST API
- Cloud Platforms: GCP, AWS, serverless
- Rust: memory safety, ownership, cargo
- Message Systems: Solace, Kafka, Pub/Sub, event streaming
- Data Engineering: Dataflow, Airflow, ETL, pipeline
- Databases: BigQuery, BigTable, MongoDB, PostgreSQL, Redis
- Infrastructure: Terraform, IaC
- DevOps: Jenkins, CI/CD, deployment

FINANCIAL TERMS:
- Common abbreviations: P&L, ROI, IPO, M&A
- Trading terms: long position, short position, bull market, bear market
- Market data: bid, ask, spread, volume, volatility

- Use standard terminology that developers and financial professionals commonly use

Examples:
General:
- User: '你好吗?' → Output: 'How are you doing?'
- User: 'What time is it?' → Output: '现在几点了？'
- User: '这个怎么用?' → Output: 'How do you use this?'
- User: 'Can you help me?' → Output: '你能帮我吗？'

Technical:
- User: '微服务架构' → Output: 'Microservices architecture'
- User: 'Deploy to GCP' → Output: '部署到GCP'
- User: '这个API有问题' → Output: 'This API has issues'
- User: 'Kafka consumer lag' → Output: 'Kafka消费者延迟'
- User: '数据管道失败了' → Output: 'Data pipeline failed'
- User: 'CI/CD pipeline is broken' → Output: 'CI/CD管道坏了'
- User: 'BigQuery查询优化' → Output: 'BigQuery query optimization'
- User: 'Redis cache hit rate' → Output: 'Redis缓存命中率'
- User: '数据库连接池' → Output: 'Database connection pool'
- User: 'Airflow DAG scheduling' → Output: 'Airflow DAG调度'
- User: 'MongoDB索引优化' → Output: 'MongoDB index optimization'

Financial:
- User: '今天的P&L怎么样?' → Output: 'How's today's P&L?'
- User: 'The market is bullish' → Output: '市场看涨'
- User: '我想做空这只股票' → Output: 'I want to short this stock'
- User: 'ROI looks good' → Output: '投资回报率看起来不错'

Remember: You are a translation tool with technical and financial expertise, not a conversational AI. Translate everything literally and naturally with proper technical/financial context."#.to_string(),
        },
        SystemPrompt {
            id: "file_operations".to_string(),
            content: r#"You are a professional file operations assistant responsible for handling various file-related tasks, including reading, creating, updating, deleting, and searching files. You need to ensure the security and accuracy of file operations, following best practices for file system operations. When performing file operations, please pay attention to permission checks, path validation, and data integrity."#.to_string(),
        },
        SystemPrompt {
            id: "command_execution".to_string(),
            content: r#"You are a system command execution assistant responsible for safely executing user-requested system commands. You need to ensure command security, validate command parameters, and avoid executing potentially dangerous operations. Before executing commands, please carefully check the legality and security of commands, and provide detailed execution results and error handling."#.to_string(),
        },
    ]
}

impl SystemPromptService {
    pub fn new(storage_path: PathBuf) -> Self {
        Self {
            prompts: Arc::new(RwLock::new(HashMap::new())),
            storage_path,
        }
    }

    pub async fn load_from_storage(&self) -> Result<(), String> {
        let file_path = self.storage_path.join("system_prompts.json");

        // If file doesn't exist, initialize only with the protected default prompt (general_assistant)
        if !file_path.exists() {
            let defaults = get_default_prompts();
            let general_assistant = defaults
                .iter()
                .find(|p| p.id == "general_assistant")
                .ok_or_else(|| "Default prompt 'general_assistant' not found".to_string())?;

            let mut prompts = self.prompts.write().await;
            prompts.insert("general_assistant".to_string(), general_assistant.clone());
            drop(prompts); // Release lock before saving
            return self.save_to_storage().await;
        }

        match fs::read_to_string(&file_path).await {
            Ok(content) => match serde_json::from_str::<HashMap<String, SystemPrompt>>(&content) {
                Ok(mut stored_prompts) => {
                    // Only ensure general_assistant exists (protected default prompt)
                    // Other default prompts can be deleted by users
                    let mut need_save = false;

                    if !stored_prompts.contains_key("general_assistant") {
                        // Restore only the protected default prompt
                        let defaults = get_default_prompts();
                        if let Some(general_assistant) =
                            defaults.iter().find(|p| p.id == "general_assistant")
                        {
                            stored_prompts
                                .insert("general_assistant".to_string(), general_assistant.clone());
                            need_save = true;
                        }
                    }

                    let mut prompts = self.prompts.write().await;
                    *prompts = stored_prompts;
                    drop(prompts); // Release lock before saving if needed

                    if need_save {
                        self.save_to_storage().await?;
                    }

                    Ok(())
                }
                Err(e) => Err(format!("Failed to parse system prompts: {}", e)),
            },
            Err(e) => Err(format!("Failed to read system prompts file: {}", e)),
        }
    }

    pub async fn save_to_storage(&self) -> Result<(), String> {
        let file_path = self.storage_path.join("system_prompts.json");

        if !self.storage_path.exists() {
            if let Err(e) = fs::create_dir_all(&self.storage_path).await {
                return Err(format!("Failed to create storage directory: {}", e));
            }
        }

        let prompts = self.prompts.read().await;
        match serde_json::to_string_pretty(&*prompts) {
            Ok(content) => fs::write(&file_path, content)
                .await
                .map_err(|e| format!("Failed to write system prompts file: {}", e)),
            Err(e) => Err(format!("Failed to serialize system prompts: {}", e)),
        }
    }

    pub async fn list_prompts(&self) -> Vec<SystemPrompt> {
        // Reload from storage to get latest changes (real-time reading)
        if let Err(e) = self.load_from_storage().await {
            log::warn!("Failed to reload prompts from storage: {}", e);
        }

        let prompts = self.prompts.read().await;
        prompts.values().cloned().collect()
    }

    pub async fn get_prompt(&self, id: &str) -> Option<SystemPrompt> {
        // Reload from storage to get latest changes (real-time reading)
        if let Err(e) = self.load_from_storage().await {
            log::warn!("Failed to reload prompts from storage: {}", e);
        }

        let prompts = self.prompts.read().await;
        prompts.get(id).cloned()
    }

    /// Get prompt without reloading (for internal use)
    pub async fn get_prompt_cached(&self, id: &str) -> Option<SystemPrompt> {
        let prompts = self.prompts.read().await;
        prompts.get(id).cloned()
    }

    pub async fn create_prompt(&self, prompt: SystemPrompt) -> Result<(), String> {
        let mut prompts = self.prompts.write().await;
        prompts.insert(prompt.id.clone(), prompt.clone());
        drop(prompts); // Release lock before saving

        self.save_to_storage().await
    }

    pub async fn update_prompt(&self, id: &str, content: String) -> Result<(), String> {
        let mut prompts = self.prompts.write().await;

        if let Some(prompt) = prompts.get_mut(id) {
            prompt.content = content;
            drop(prompts); // Release lock before saving
            self.save_to_storage().await
        } else {
            Err(format!("System prompt '{}' not found", id))
        }
    }

    pub async fn delete_prompt(&self, id: &str) -> Result<(), String> {
        // Prevent deletion of default prompt
        if id == "general_assistant" {
            return Err("Cannot delete the default system prompt 'general_assistant'".to_string());
        }

        let mut prompts = self.prompts.write().await;

        if prompts.remove(id).is_some() {
            drop(prompts); // Release lock before saving
            self.save_to_storage().await
        } else {
            Err(format!("System prompt '{}' not found", id))
        }
    }
}
