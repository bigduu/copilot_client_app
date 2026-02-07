use thiserror::Error;

#[derive(Debug, Error)]
#[error("proxy_auth_required")]
pub struct ProxyAuthRequiredError;
