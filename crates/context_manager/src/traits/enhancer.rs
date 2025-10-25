use crate::structs::context::ChatContext;

// In a real scenario, this would be an async trait.
pub trait Enhancer {
    fn enhance(&self, context: &mut ChatContext) -> Result<(), String>;
}
