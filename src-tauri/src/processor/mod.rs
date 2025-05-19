use std::sync::Arc;

use crate::copilot::model::stream_model::Message;
use async_trait::async_trait;
pub mod mcp_proceeor;
pub mod tools_processor;
#[async_trait]
pub trait Processor: Send + Sync {
    fn enabled(&self) -> bool;
    fn order(&self) -> usize;
    async fn process(&self, messages: Vec<Message>) -> Vec<Message>;
}

pub struct ProcessorManager {
    processors: Vec<Arc<dyn Processor>>,
}

impl ProcessorManager {
    pub fn new(processors: Vec<Arc<dyn Processor>>) -> Self {
        let mut processors = processors;
        processors.sort_by_key(|p| p.order());
        Self { processors }
    }

    pub fn add_processor(&mut self, processor: Arc<dyn Processor>) {
        self.processors.push(processor);
        self.processors.sort_by_key(|p| p.order());
    }

    pub async fn process(&self, messages: Vec<Message>) -> Vec<Message> {
        let mut messages = messages;
        for processor in self.processors.iter() {
            if processor.enabled() {
                messages = processor.process(messages).await;
            }
        }
        messages
    }
}

pub fn pop_last_message(messages: Vec<Message>) -> (Option<Message>, Vec<Message>) {
    let mut messages = messages;
    let last_message = messages.pop();
    (last_message, messages)
}
