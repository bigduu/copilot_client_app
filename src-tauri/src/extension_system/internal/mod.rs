//! Internal Extensions Module
//!
//! This module contains internal/company-specific tools and categories.
//! They register to the same global MAPs as core extensions.

pub mod categories;
pub mod extensions;

// Import modules to trigger registration (only if internal feature is enabled)
#[cfg(feature = "internal")]
use categories::*;
#[cfg(feature = "internal")]
use extensions::*;

// Internal extensions register automatically to the same global MAPs
// No special handling needed - if they exist, they register; if not, they don't.
