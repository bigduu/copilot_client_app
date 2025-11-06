use crate::error::ContextError;
use crate::structs::context::ChatContext;
use crate::structs::events::ContextUpdate;
use crate::structs::message::{IncomingMessage, IncomingTextMessage};
use futures::stream::BoxStream;
use uuid::Uuid;

pub struct MessagePipeline {
    processors: Vec<Box<dyn MessageProcessor + Send + Sync>>,
}

impl MessagePipeline {
    pub fn new() -> Self {
        Self {
            processors: Vec::new(),
        }
    }

    pub fn with_default_processors() -> Self {
        Self {
            processors: vec![
                Box::new(ValidationProcessor::default()),
                Box::new(TextMessageProcessor::default()),
            ],
        }
    }

    pub fn add_processor<P>(mut self, processor: P) -> Self
    where
        P: MessageProcessor + Send + Sync + 'static,
    {
        self.processors.push(Box::new(processor));
        self
    }

    pub fn process(
        &self,
        context: &mut ChatContext,
        message: &IncomingMessage,
    ) -> Result<BoxStream<'static, ContextUpdate>, ContextError> {
        for processor in &self.processors {
            match processor.process(context, message)? {
                Some(ProcessResult::Continue) => {
                    continue;
                }
                Some(ProcessResult::Complete { updates }) => {
                    return Ok(updates);
                }
                Some(ProcessResult::NeedsApproval { request_id }) => {
                    // TODO: propagate approval requirement to caller once approval flow is integrated.
                    return Err(ContextError::ApprovalRequired(request_id));
                }
                Some(ProcessResult::ExecuteTools { .. }) => {
                    // TODO: hook into tool execution pipeline.
                    return Err(ContextError::ToolExecutionRequired);
                }
                None => continue,
            }
        }

        Err(ContextError::UnsupportedMessageType(message.kind()))
    }
}

impl Default for MessagePipeline {
    fn default() -> Self {
        Self::with_default_processors()
    }
}

pub trait MessageProcessor: Send + Sync {
    fn process(
        &self,
        context: &mut ChatContext,
        message: &IncomingMessage,
    ) -> Result<Option<ProcessResult>, ContextError>;
}

pub enum ProcessResult {
    Continue,
    Complete {
        updates: BoxStream<'static, ContextUpdate>,
    },
    NeedsApproval {
        request_id: Uuid,
    },
    ExecuteTools {
        tool_requests: Vec<crate::structs::tool::ToolCallRequest>,
    },
}

#[derive(Default)]
struct ValidationProcessor;

impl MessageProcessor for ValidationProcessor {
    fn process(
        &self,
        _context: &mut ChatContext,
        message: &IncomingMessage,
    ) -> Result<Option<ProcessResult>, ContextError> {
        match message {
            IncomingMessage::Text(IncomingTextMessage { content, .. }) => {
                if content.trim().is_empty() {
                    return Err(ContextError::EmptyMessageContent);
                }
                Ok(Some(ProcessResult::Continue))
            }
        }
    }
}

struct TextMessageProcessor;

impl Default for TextMessageProcessor {
    fn default() -> Self {
        Self
    }
}

impl MessageProcessor for TextMessageProcessor {
    fn process(
        &self,
        context: &mut ChatContext,
        message: &IncomingMessage,
    ) -> Result<Option<ProcessResult>, ContextError> {
        match message {
            IncomingMessage::Text(payload) => {
                let updates = context.handle_text_message(payload)?;
                Ok(Some(ProcessResult::Complete { updates }))
            }
        }
    }
}
