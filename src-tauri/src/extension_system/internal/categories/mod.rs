//! Internal Categories
//!
//! Company-specific categories that register to the same global categories MAP.

#[cfg(feature = "internal")]
pub mod company_tools;

// Re-export categories if internal feature is enabled
#[cfg(feature = "internal")]
pub use company_tools::CompanyToolsCategory;
