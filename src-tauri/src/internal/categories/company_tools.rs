//! Company Tools Category
//!
//! Category for company-specific tools like Bitbucket, Confluence, etc.

use crate::extension_system::{auto_register_category, Category, CategoryId, CategoryMetadata};

/// Company tools category for internal company-specific functionality
#[derive(Debug)]
pub struct CompanyToolsCategory;

impl CompanyToolsCategory {
    pub const CATEGORY_ID: &'static str = "company_tools";

    pub fn new() -> Self {
        Self
    }
}

impl Category for CompanyToolsCategory {
    fn metadata(&self) -> CategoryMetadata {
        CategoryMetadata {
            id: Self::CATEGORY_ID.to_string(),
            name: "company_tools".to_string(),
            display_name: "Company Tools".to_string(),
            description: "Access company-specific tools and services like Bitbucket, Confluence, and internal systems".to_string(),
            icon: "BankOutlined".to_string(),
            emoji_icon: "🏢".to_string(),
            enabled: true,
            strict_tools_mode: false,
            system_prompt: "You are an assistant with access to company-specific tools. You can help users access Bitbucket repositories, search Confluence documentation, and interact with other internal company systems. Always prioritize security and follow company policies when accessing internal resources.".to_string(),
            category_type: CategoryId::GeneralAssistant,
            priority: 100,
        }
    }

    fn required_tools(&self) -> &'static [&'static str] {
        &["bitbucket", "confluence"]
    }

    fn enable(&self) -> bool {
        // Check if we're in a company environment
        std::env::var("COMPANY_INTERNAL").unwrap_or_default() == "true"
    }
}

// Auto-register the category
auto_register_category!(CompanyToolsCategory);
