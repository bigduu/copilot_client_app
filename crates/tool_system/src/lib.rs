pub mod categories;
pub mod compat;
pub mod examples;
pub mod extensions;
pub mod internal;
pub mod manager;
pub mod registry;
pub mod types;

use crate::manager::ToolsManager;

pub fn create_tools_manager() -> ToolsManager {
    ToolsManager::new()
}
