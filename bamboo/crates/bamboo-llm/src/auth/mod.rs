//! Copilot Authentication Module
//! 
//! Device Code Flow:
//! 1. Get device code from github.com/login/device/code
//! 2. User authorizes at github.com/login/device
//! 3. Poll for access token
//! 4. Exchange for copilot token
//! 5. Cache and use

pub mod device_code;
pub mod token;
pub mod cache;

pub use device_code::{get_device_code, DeviceCodeResponse, present_device_code};
pub use token::{poll_access_token, get_copilot_token, CopilotToken};
pub use cache::TokenCache;
