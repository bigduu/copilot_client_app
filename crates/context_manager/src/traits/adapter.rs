use crate::structs::context::ChatContext;
use serde::Serialize;

pub trait Adapter {
    type RequestBody: Serialize;
    fn adapt(&self, context: &ChatContext) -> Result<Self::RequestBody, String>;
}