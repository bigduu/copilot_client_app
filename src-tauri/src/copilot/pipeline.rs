use std::{path::PathBuf, sync::Arc};

use llm_proxy_core::{Pipeline, ProcessorChain};
use llm_proxy_openai::{ChatCompletionRequest, OpenAIClient};

use crate::copilot::providers::{
    client_provider::CopilotClientProvider, request_parse::JsonRequestParser,
    token_provider::CopilotTokenProvider, url_provider::CopilotUrlProvider,
};

pub fn create_pipeline(app_data_dir: impl Into<PathBuf>) -> Pipeline<ChatCompletionRequest> {
    let client_provider = Arc::new(CopilotClientProvider::new());
    let token_provider = Arc::new(CopilotTokenProvider::new(app_data_dir.into()));
    let url_provider = Arc::new(CopilotUrlProvider::new());
    let parser = Arc::new(JsonRequestParser::new());
    let processor_chain = Arc::new(ProcessorChain::new(vec![]));
    let llm_client = Arc::new(OpenAIClient::new(
        client_provider,
        token_provider,
        url_provider,
    ));

    Pipeline::new(parser, processor_chain, llm_client)
}
