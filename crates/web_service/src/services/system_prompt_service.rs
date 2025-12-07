use context_manager::structs::branch::SystemPrompt;
use serde_json;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::fs;
use tokio::sync::RwLock;

/// Hardcoded TODO list guidance for AI
/// This guidance instructs the AI on when and how to create and update TODO lists
const TODO_LIST_GUIDANCE: &str = r#"

# TODO List Usage Guide

## When to Create TODO Lists

You MUST create a TODO list in your response when:
1. **User requests a workflow** (explicit commands like `/deploy` or natural language like "set up a new project")
2. **Complex multi-step tasks** (tasks requiring 3+ distinct steps)
3. **Tasks with dependencies** (when step B depends on completing step A)
4. **Long-running operations** (estimated to take >30 seconds)

## TODO List Format

Use GitHub-style markdown checkboxes in your responses:
- `[ ]` = Pending task (not started)
- `[/]` = In progress (currently working on this)
- `[x]` = Completed successfully
- `[-]` = Skipped (not needed or bypassed)
- `[!]` = Failed with error

### Example Structure:
```markdown
# [Task Title]

Brief description of what we're doing.

## Steps
- [ ] Step 1: Initialize project structure
- [ ] Step 2: Install dependencies  
- [ ] Step 3: Configure build system
- [ ] Step 4: Create example files
```

## Progress Updates

As you work through tasks, update the TODO list status in real-time:

1. **Starting work**: Change `[ ]` to `[/]` when you begin a step
2. **Completing work**: Change `[/]` to `[x]` when successfully done
3. **Adding context**: Add notes or error messages below items if needed
4. **Keep user informed**: Show updated TODO list after each step

### Example Progress:
```markdown
# Setup New React Project

## Steps
- [x] Initialize project structure ✓ Created package.json
- [/] Install dependencies      ← Currently running npm install
- [ ] Configure build system
- [ ] Create example files
```

## Auto-Loop Workflow Execution

**CRITICAL**: When user sends a workflow request, follow this EXACT process:

### Step 1: Create TODO List FIRST (in current response)
- Analyze the workflow requirements
- Create a complete TODO list with all steps
- **STOP** your current response after creating the TODO list
- DO NOT execute any steps yet

### Step 2: Execute Each Step Separately
- The system will auto-loop and call you again
- In each subsequent response:
  1. Show the updated TODO list (mark current step as `[/]`)
  2. Execute ONLY ONE step
  3. Update that step to `[x]` or `[!]`
  4. Provide brief output for that step
  5. **STOP** - let system loop again for next step

### Example Workflow:

**Response 1** (Create TODO list):
```markdown
# Example Workflow

This is a simple example workflow to demonstrate the workflow system.

## Steps
- [ ] First, say hello to the user
- [ ] Then, tell a long and interesting story about AI and technology
```

**Response 2** (Execute Step 1):
```markdown
# Example Workflow

## Steps
- [/] First, say hello to the user
- [ ] Then, tell a long and interesting story about AI and technology
```

Hello! I'm here to help you...

```markdown
## Steps
- [x] First, say hello to the user ✓
- [ ] Then, tell a long and interesting story about AI and technology
```

**Response 3** (Execute Step 2):
```markdown
# Example Workflow

## Steps
- [x] First, say hello to the user ✓
- [/] Then, tell a long and interesting story about AI and technology
```

Let me tell you an interesting story...

```markdown
## Steps
- [x] First, say hello to the user ✓
- [x] Then, tell a long and interesting story about AI and technology ✓
```

## Workflow Integration

When a user describes a workflow (e.g., "set up a new project", "deploy the application"):
1. **Analyze** available tools and capabilities
2. **Create** TODO list outlining all steps IN CURRENT RESPONSE
3. **STOP** and wait for system to loop
4. **Execute** ONE step per response when looped back
5. **Update** TODO list as you progress
6. **Report** results and handle errors appropriately

## Best Practices

- **Create TODO list first**: ALWAYS create the full TODO list before executing
- **STOP after Step 1**: Execute ONLY the first step, then use `AGENT_CONTINUE` to let the system loop.
- **NEVER do all steps at once**: Even if simple, you MUST split the work to show progress.
- **One step per response**: Strictly one step at a time unless they are trivial one-liners.
- **Be specific**: Each TODO item should be actionable and clear
- **Stay updated**: Always show updated TODO list with current progress
- **Handle errors**: If a step fails, mark it with `[!]` and explain what went wrong
- **Communicate**: Keep the user informed through TODO list updates

## Examples

### Good TODO List:
```markdown
# Deploy Application to Production

## Steps
- [x] Run tests ✓ All 245 tests passed
- [/] Build Docker image ← Building v2.3.1
- [ ] Push to registry
- [ ] Update Kubernetes deployment
- [ ] Verify deployment health
```

### Bad TODO List (too vague):
```markdown
# Do stuff
- [ ] Thing 1
- [ ] Thing 2
- [ ] Finish
```

Remember: TODO lists are powerful tools for complex tasks. Use them when appropriate to give users visibility into your progress!

## Agent Continuation

**CRITICAL**: When a task requires multiple responses to complete, you can request automatic continuation.

### When to Use Continuation

Use `<!-- AGENT_CONTINUE: reason -->` when:
- **Multi-step workflows**: TODO lists with remaining steps (CRITICAL: Do not finish all steps at once!)
- **Long content generation**: Articles, reports split across responses
- **Complex analysis**: Multi-stage research or investigation
- **Large code generation**: Multiple files or components

### Continuation Marker

You have a mechanism to pause and wait for confirmation called `AGENT_CONTINUE`.
Output `<!-- AGENT_CONTINUE: reason -->` when you need to stop and wait for the frontend/user to trigger the next step.
This is used for:
1. **Workflows**: To pause after the Plan, and after each Step.
2. **Long tasks**: To break up generation.

Always use this marker instead of asking the user explicitly with text "Shall I continue?". The marker handles the flow.

End your response with:
```
<!-- AGENT_CONTINUE: brief reason -->
```

The system will automatically call you again to continue the task.

### DO NOT Continue When

- Task is complete
- Waiting for user input
- Error occurred requiring user intervention
- No clear next step

### Examples

**Workflow continuation**:
```markdown
## Steps
- [x] Deploy backend ✓
- [/] Deploy frontend

Deploying frontend to production...

<!-- AGENT_CONTINUE: next workflow step -->
```

**Long content continuation**:
```markdown
# The History of AI (Part 1/3)

[...2000 words about early AI...]

<!-- AGENT_CONTINUE: continuing part 2 of 3 -->
```

**Code generation continuation**:
```markdown
Created `api/users.ts` (350 lines)
Created `api/auth.ts` (280 lines)

Next: Creating `api/products.ts`...

<!-- AGENT_CONTINUE: generating remaining API files -->
```

### Safety

- Maximum 10 continuations per task
- System tracks continuation count
- If limit reached, system will notify user

"#;

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

You combine architect-level strategic thinking with hands-on development expertise. You can quickly understand new requirements, provide architectural guidance, suggest implementation approaches, help with troubleshooting, and deliver practical solutions. You excel at translating business needs into technical solutions and can rapidly adapt to new technologies and domains. When discussing financial topics, treat them as enriching domain knowledge rather than primary expertise.

"#.to_string() + TODO_LIST_GUIDANCE,
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

    /// Get a cached system prompt with TODO list guidance automatically appended
    /// This method ensures all prompts include instructions for using TODO lists (no reload)
    pub async fn get_prompt_cached_with_todo_guidance(&self, id: &str) -> Option<String> {
        self.get_prompt_cached(id)
            .await
            .map(|prompt| format!("{}\n{}", prompt.content, TODO_LIST_GUIDANCE))
    }
}
