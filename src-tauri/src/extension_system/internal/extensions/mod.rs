//! Internal Extensions
//!
//! Company-specific tools that register to the same global tools MAP.

#[cfg(feature = "internal")]
pub mod bitbucket;
#[cfg(feature = "internal")]
pub mod confluence;

// Re-export tools if internal feature is enabled
#[cfg(feature = "internal")]
pub use bitbucket::BitbucketTool;
#[cfg(feature = "internal")]
pub use confluence::ConfluenceTool;
