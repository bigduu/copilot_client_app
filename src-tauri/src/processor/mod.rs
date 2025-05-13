use crate::copilot::stream_model::Message;

pub trait Processor {
    async fn process(messages: Vec<Message>) -> anyhow::Result<Vec<Message>>;
}
