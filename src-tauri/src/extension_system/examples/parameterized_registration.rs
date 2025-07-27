//! Examples of parameterized tool and category registration
//!
//! This file demonstrates different ways to register tools and categories
//! that require constructor parameters.

use anyhow::Result;
use async_trait::async_trait;
use std::sync::Arc;

use crate::extension_system::{
    auto_register_category, auto_register_category_advanced,
    auto_register_category_with_constructor, auto_register_tool, auto_register_tool_advanced,
    auto_register_tool_with_constructor, Category, CategoryId, CategoryMetadata, Parameter, Tool,
    ToolType,
};

// ============================================================================
// Example 1: Simple tool with no parameters (existing pattern)
// ============================================================================

#[derive(Debug)]
pub struct SimpleTool;

impl SimpleTool {
    pub const TOOL_NAME: &'static str = "simple_tool";

    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl Tool for SimpleTool {
    fn name(&self) -> String {
        Self::TOOL_NAME.to_string()
    }

    fn description(&self) -> String {
        "A simple tool with no constructor parameters".to_string()
    }

    fn parameters(&self) -> Vec<Parameter> {
        vec![]
    }

    fn required_approval(&self) -> bool {
        false
    }

    fn tool_type(&self) -> ToolType {
        ToolType::AIParameterParsing
    }

    async fn execute(&self, _parameters: Vec<Parameter>) -> Result<String> {
        Ok("Simple tool executed".to_string())
    }
}

// Register using the original macro
auto_register_tool!(SimpleTool);

// ============================================================================
// Example 2: Tool with configuration parameters
// ============================================================================

#[derive(Debug)]
pub struct ConfigurableTool {
    base_url: String,
    api_key: String,
    timeout: u64,
}

impl ConfigurableTool {
    pub const TOOL_NAME: &'static str = "configurable_tool";

    pub fn new(base_url: String, api_key: String, timeout: u64) -> Self {
        Self {
            base_url,
            api_key,
            timeout,
        }
    }
}

#[async_trait]
impl Tool for ConfigurableTool {
    fn name(&self) -> String {
        Self::TOOL_NAME.to_string()
    }

    fn description(&self) -> String {
        format!("A configurable tool connecting to {}", self.base_url)
    }

    fn parameters(&self) -> Vec<Parameter> {
        vec![Parameter {
            name: "action".to_string(),
            description: "The action to perform".to_string(),
            required: true,
            value: "".to_string(),
        }]
    }

    fn required_approval(&self) -> bool {
        false
    }

    fn tool_type(&self) -> ToolType {
        ToolType::AIParameterParsing
    }

    async fn execute(&self, parameters: Vec<Parameter>) -> Result<String> {
        let action = parameters
            .iter()
            .find(|p| p.name == "action")
            .map(|p| &p.value)
            .unwrap_or("default");

        Ok(format!(
            "Configurable tool executed action '{}' on {} with timeout {}s",
            action, self.base_url, self.timeout
        ))
    }
}

// Register with custom constructor - this would typically be done in an init function
// where you have access to configuration values
// auto_register_tool_with_constructor!(
//     ConfigurableTool,
//     || Arc::new(ConfigurableTool::new(
//         "https://api.example.com".to_string(),
//         "secret-key".to_string(),
//         30
//     ))
// );

// ============================================================================
// Example 3: Category with configuration
// ============================================================================

#[derive(Debug)]
pub struct ConfigurableCategory {
    enabled: bool,
    max_tools: usize,
    environment: String,
}

impl ConfigurableCategory {
    pub const CATEGORY_ID: &'static str = "configurable_category";

    pub fn new(enabled: bool, max_tools: usize, environment: String) -> Self {
        Self {
            enabled,
            max_tools,
            environment,
        }
    }
}

impl Category for ConfigurableCategory {
    fn metadata(&self) -> CategoryMetadata {
        CategoryMetadata {
            id: Self::CATEGORY_ID.to_string(),
            name: "configurable_category".to_string(),
            display_name: format!("Configurable Category ({})", self.environment),
            description: format!(
                "A configurable category for {} environment with max {} tools",
                self.environment, self.max_tools
            ),
            icon: "SettingOutlined".to_string(),
            emoji_icon: "⚙️".to_string(),
            enabled: self.enabled,
            strict_tools_mode: false,
            system_prompt: format!(
                "You are operating in {} environment with access to {} tools maximum.",
                self.environment, self.max_tools
            ),
            category_type: CategoryId::GeneralAssistant, // Use appropriate type
            priority: 50,
        }
    }

    fn required_tools(&self) -> &'static [&'static str] {
        &["simple_tool", "configurable_tool"]
    }

    fn enable(&self) -> bool {
        self.enabled
    }
}

// Register with custom constructor - this would typically be done in an init function
// auto_register_category_with_constructor!(
//     ConfigurableCategory,
//     || Box::new(ConfigurableCategory::new(
//         true,
//         10,
//         "production".to_string()
//     ))
// );

// ============================================================================
// Example 4: Registration in an initialization function
// ============================================================================

/// Example initialization function that registers parameterized tools and categories
pub fn init_with_config(config: &AppConfig) {
    // Register configurable tool with actual config values
    auto_register_tool_with_constructor!(ConfigurableTool, || Arc::new(ConfigurableTool::new(
        config.api_base_url.clone(),
        config.api_key.clone(),
        config.timeout_seconds
    )));

    // Register configurable category with actual config values
    auto_register_category_with_constructor!(ConfigurableCategory, || Box::new(
        ConfigurableCategory::new(
            config.enable_advanced_features,
            config.max_tools_per_category,
            config.environment.clone()
        )
    ));
}

/// Example configuration structure
#[derive(Debug, Clone)]
pub struct AppConfig {
    pub api_base_url: String,
    pub api_key: String,
    pub timeout_seconds: u64,
    pub enable_advanced_features: bool,
    pub max_tools_per_category: usize,
    pub environment: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            api_base_url: "https://api.example.com".to_string(),
            api_key: "default-key".to_string(),
            timeout_seconds: 30,
            enable_advanced_features: true,
            max_tools_per_category: 10,
            environment: "development".to_string(),
        }
    }
}

// ============================================================================
// Example 5: Using advanced macros with different patterns
// ============================================================================

/// Tool that reads configuration from environment variables
#[derive(Debug)]
pub struct EnvironmentTool {
    service_url: String,
    debug_mode: bool,
}

impl EnvironmentTool {
    pub const TOOL_NAME: &'static str = "environment_tool";

    pub fn new(service_url: String, debug_mode: bool) -> Self {
        Self {
            service_url,
            debug_mode,
        }
    }
}

#[async_trait]
impl Tool for EnvironmentTool {
    fn name(&self) -> String {
        Self::TOOL_NAME.to_string()
    }

    fn description(&self) -> String {
        format!(
            "Environment tool connecting to {} (debug: {})",
            self.service_url, self.debug_mode
        )
    }

    fn parameters(&self) -> Vec<Parameter> {
        vec![]
    }

    fn required_approval(&self) -> bool {
        !self.debug_mode // Require approval in production
    }

    fn tool_type(&self) -> ToolType {
        ToolType::AIParameterParsing
    }

    async fn execute(&self, _parameters: Vec<Parameter>) -> Result<String> {
        Ok(format!("Environment tool executed on {}", self.service_url))
    }
}

// Register using advanced macro with environment variable reading
auto_register_tool_advanced!(EnvironmentTool, || {
    let service_url =
        std::env::var("SERVICE_URL").unwrap_or_else(|_| "http://localhost:8080".to_string());
    let debug_mode = std::env::var("DEBUG_MODE")
        .map(|v| v.to_lowercase() == "true")
        .unwrap_or(false);

    Arc::new(EnvironmentTool::new(service_url, debug_mode))
});

/// Tool with fallback constructor pattern
#[derive(Debug)]
pub struct FlexibleTool {
    config: String,
}

impl FlexibleTool {
    pub const TOOL_NAME: &'static str = "flexible_tool";

    // Default constructor for auto registration
    pub fn new() -> Self {
        Self::with_config("default".to_string())
    }

    // Parameterized constructor
    pub fn with_config(config: String) -> Self {
        Self { config }
    }
}

#[async_trait]
impl Tool for FlexibleTool {
    fn name(&self) -> String {
        Self::TOOL_NAME.to_string()
    }

    fn description(&self) -> String {
        format!("Flexible tool with config: {}", self.config)
    }

    fn parameters(&self) -> Vec<Parameter> {
        vec![]
    }

    fn required_approval(&self) -> bool {
        false
    }

    fn tool_type(&self) -> ToolType {
        ToolType::AIParameterParsing
    }

    async fn execute(&self, _parameters: Vec<Parameter>) -> Result<String> {
        Ok(format!(
            "Flexible tool executed with config: {}",
            self.config
        ))
    }
}

// Can use either approach:
// 1. Simple registration (uses default constructor)
auto_register_tool!(FlexibleTool);

// 2. Or advanced registration with custom config
// auto_register_tool_advanced!(FlexibleTool, || {
//     Arc::new(FlexibleTool::with_config("custom-config".to_string()))
// });

// ============================================================================
// Example 6: Conditional registration based on features
// ============================================================================

/// Tool that's only available in certain environments
#[derive(Debug)]
pub struct ConditionalTool;

impl ConditionalTool {
    pub const TOOL_NAME: &'static str = "conditional_tool";

    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl Tool for ConditionalTool {
    fn name(&self) -> String {
        Self::TOOL_NAME.to_string()
    }

    fn description(&self) -> String {
        "A tool that's only available in certain conditions".to_string()
    }

    fn parameters(&self) -> Vec<Parameter> {
        vec![]
    }

    fn required_approval(&self) -> bool {
        true
    }

    fn tool_type(&self) -> ToolType {
        ToolType::AIParameterParsing
    }

    async fn execute(&self, _parameters: Vec<Parameter>) -> Result<String> {
        Ok("Conditional tool executed".to_string())
    }
}

// Conditional registration based on environment
#[cfg(feature = "advanced-tools")]
auto_register_tool!(ConditionalTool);

// Or using advanced macro with runtime condition
// auto_register_tool_advanced!(ConditionalTool, || {
//     // Only register if certain condition is met
//     if std::env::var("ENABLE_CONDITIONAL_TOOL").unwrap_or_default() == "true" {
//         Arc::new(ConditionalTool::new())
//     } else {
//         // This approach requires the constructor to return Option<Arc<dyn Tool>>
//         // which would require changes to the registration system
//         panic!("Conditional tool not enabled")
//     }
// });
