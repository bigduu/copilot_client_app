//! General Assistant Category
//!
//! Contains general AI assistant tools

use crate::extension_system::{auto_register_category, Category, CategoryId, CategoryMetadata};

/// General Assistant Category
#[derive(Debug)]
pub struct GeneralAssistantCategory {
    enabled: bool,
}

impl GeneralAssistantCategory {
    pub const CATEGORY_ID: &'static str = "general_assistant";

    /// Create a new general assistant category
    pub fn new() -> Self {
        Self { enabled: true }
    }

    /// Set whether this category is enabled
    pub fn with_enabled(mut self, enabled: bool) -> Self {
        self.enabled = enabled;
        self
    }
}

impl Default for GeneralAssistantCategory {
    fn default() -> Self {
        Self::new()
    }
}

impl Category for GeneralAssistantCategory {
    fn metadata(&self) -> CategoryMetadata {
        CategoryMetadata {
            id: Self::CATEGORY_ID.to_string(),
            name: "general_assistant".to_string(),
            display_name: "General Assistant".to_string(),
            description: "Provides general AI assistant functionality and conversation support, offering intelligent help to users".to_string(),
            icon: "ToolOutlined".to_string(),
            emoji_icon: "🤖".to_string(),
            enabled: self.enabled,
            strict_tools_mode: false, // General assistant requires natural language interaction
            system_prompt: "You are an intelligent AI assistant with expertise in software development and financial technology. You specialize in:

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

You combine architect-level strategic thinking with hands-on development expertise. You can quickly understand new requirements, provide architectural guidance, suggest implementation approaches, help with troubleshooting, and deliver practical solutions. You excel at translating business needs into technical solutions and can rapidly adapt to new technologies and domains. When discussing financial topics, treat them as enriching domain knowledge rather than primary expertise.".to_string(),
            category_type: CategoryId::GeneralAssistant,
            priority: 1, // General assistant has the lowest priority, serving as a fallback function
        }
    }

    fn required_tools(&self) -> &'static [&'static str] {
        // General assistant has access to all available tools
        &[
            // File operations
            "create_file",
            "read_file",
            "update_file",
            "append_file",
            "delete_file",
            // Command execution
            "execute_command",
            // Search functionality
            "search",
            "simple_tool",
            "demo_tool",
        ]
    }

    fn enable(&self) -> bool {
        // General assistant category is usually always enabled as a fallback function
        self.enabled
    }
}

// Auto-register the category
auto_register_category!(GeneralAssistantCategory);
