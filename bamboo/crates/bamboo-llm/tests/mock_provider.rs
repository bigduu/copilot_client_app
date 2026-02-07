use async_trait::async_trait;
use std::pin::Pin;
use futures::Stream;
use bamboo_llm::{LLMProvider, LLMChunk, LLMError};
use bamboo_core::{Message, tools::ToolSchema};

/// Mock LLM Provider for testing
pub struct MockLLMProvider {
    responses: Vec<LLMChunk>,
}

impl MockLLMProvider {
    pub fn new(responses: Vec<LLMChunk>) -> Self {
        Self {
            responses,
        }
    }

    /// Create a simple text response mock
    pub fn with_text_response(text: &str) -> Self {
        let chunks: Vec<LLMChunk> = text
            .chars()
            .map(|c| LLMChunk::Token(c.to_string()))
            .collect();
        Self::new(chunks)
    }

    /// Create a mock that returns tool calls
    pub fn with_tool_calls(tool_calls: Vec<bamboo_core::tools::ToolCall>) -> Self {
        Self::new(vec![LLMChunk::ToolCalls(tool_calls)])
    }

    /// Create a mock that simulates a conversation flow
    pub fn with_conversation_flow() -> Self {
        let responses = vec![
            LLMChunk::Token("I ".to_string()),
            LLMChunk::Token("will ".to_string()),
            LLMChunk::Token("help ".to_string()),
            LLMChunk::Token("you.".to_string()),
        ];
        Self::new(responses)
    }
}

#[async_trait]
impl LLMProvider for MockLLMProvider {
    async fn chat_stream(
        &self,
        _messages: &[Message],
        _tools: &[ToolSchema],
    ) -> Result<Pin<Box<dyn Stream<Item = Result<LLMChunk, LLMError>> + Send>>, LLMError> {
        let responses = self.responses.clone();
        let stream = futures::stream::iter(responses.into_iter().map(Ok));
        Ok(Box::pin(stream))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures::StreamExt;

    #[tokio::test]
    async fn test_mock_provider_text_response() {
        let mock = MockLLMProvider::with_text_response("Hello");
        let messages: Vec<Message> = vec![];
        let tools: Vec<ToolSchema> = vec![];

        let mut stream = mock.chat_stream(&messages, &tools).await.unwrap();
        
        let mut result = String::new();
        while let Some(chunk) = stream.next().await {
            match chunk.unwrap() {
                LLMChunk::Token(text) => result.push_str(&text),
                _ => {}
            }
        }

        assert_eq!(result, "Hello");
    }

    #[tokio::test]
    async fn test_mock_provider_conversation_flow() {
        let mock = MockLLMProvider::with_conversation_flow();
        let messages: Vec<Message> = vec![];
        let tools: Vec<ToolSchema> = vec![];

        let mut stream = mock.chat_stream(&messages, &tools).await.unwrap();
        
        let mut tokens = vec![];
        while let Some(chunk) = stream.next().await {
            match chunk.unwrap() {
                LLMChunk::Token(text) => tokens.push(text),
                _ => {}
            }
        }

        assert_eq!(tokens, vec!["I ", "will ", "help ", "you."]);
    }

    #[tokio::test]
    async fn test_mock_provider_empty_response() {
        let mock = MockLLMProvider::new(vec![]);
        let messages: Vec<Message> = vec![];
        let tools: Vec<ToolSchema> = vec![];

        let stream = mock.chat_stream(&messages, &tools).await.unwrap();
        let count = stream.count().await;
        assert_eq!(count, 0);
    }
}
