//! Streaming response handling for Anthropic API format.

use crate::api::models::{ChatCompletionStreamChunk, StreamToolCall};
use serde_json::{json, Value};
use std::collections::HashMap;

/// Format an SSE event
pub fn format_sse_event(event: &str, data: Value) -> String {
    format!("event: {}\ndata: {}\n\n", event, data)
}

/// Format SSE data (without event name)
pub fn format_sse_data(data: Value) -> String {
    format!("data: {}\n\n", data)
}

/// State for tracking tool use blocks during streaming
struct ToolStreamState {
    block_index: usize,
    id: Option<String>,
    name: Option<String>,
    started: bool,
}

/// Stateful handler for Anthropic streaming responses (converts OpenAI format to Anthropic)
pub struct AnthropicStreamAdapter {
    message_started: bool,
    sent_message_stop: bool,
    next_block_index: usize,
    text_block_index: Option<usize>,
    tool_blocks: HashMap<u32, ToolStreamState>,
    model: String,
    message_id: Option<String>,
}

impl AnthropicStreamAdapter {
    /// Create a new stream state
    pub fn new(model: String) -> Self {
        Self {
            message_started: false,
            sent_message_stop: false,
            next_block_index: 0,
            text_block_index: None,
            tool_blocks: HashMap::new(),
            model,
            message_id: None,
        }
    }

    /// Handle a streaming chunk and return Anthropic-formatted SSE output
    pub fn handle_chunk(&mut self, chunk: &ChatCompletionStreamChunk) -> String {
        let mut output = String::new();

        if !self.message_started {
            let message_id = chunk.id.clone();
            self.message_id = Some(message_id.clone());
            let model = if self.model.is_empty() {
                chunk.model.clone().unwrap_or_else(|| self.model.clone())
            } else {
                self.model.clone()
            };
            let message_start = json!({
                "type": "message_start",
                "message": {
                    "id": message_id,
                    "type": "message",
                    "role": "assistant",
                    "content": [],
                    "model": model,
                    "stop_reason": null,
                    "stop_sequence": null,
                    "usage": {
                        "input_tokens": 0,
                        "output_tokens": 0
                    }
                }
            });
            output.push_str(&format_sse_event("message_start", message_start));
            self.message_started = true;
        }

        for choice in &chunk.choices {
            if let Some(content) = &choice.delta.content {
                output.push_str(&self.handle_text_delta(content));
            }

            if let Some(tool_calls) = &choice.delta.tool_calls {
                output.push_str(&self.handle_tool_calls(tool_calls));
            }

            if let Some(reason) = &choice.finish_reason {
                output.push_str(&self.finish(Some(reason.as_str())));
            }
        }

        output
    }

    fn handle_text_delta(&mut self, content: &str) -> String {
        let mut output = String::new();

        let block_index = match self.text_block_index {
            Some(index) => index,
            None => {
                let index = self.next_block_index;
                self.next_block_index += 1;
                self.text_block_index = Some(index);
                let start = json!({
                    "type": "content_block_start",
                    "index": index,
                    "content_block": {
                        "type": "text",
                        "text": ""
                    }
                });
                output.push_str(&format_sse_event("content_block_start", start));
                index
            }
        };

        let delta = json!({
            "type": "content_block_delta",
            "index": block_index,
            "delta": {
                "type": "text_delta",
                "text": content
            }
        });
        output.push_str(&format_sse_event("content_block_delta", delta));

        output
    }

    fn handle_tool_calls(&mut self, tool_calls: &[StreamToolCall]) -> String {
        let mut output = String::new();

        for tool_call in tool_calls {
            let tool_index = tool_call.index;
            let entry = self.tool_blocks.entry(tool_index).or_insert_with(|| {
                let block_index = self.next_block_index;
                self.next_block_index += 1;
                ToolStreamState {
                    block_index,
                    id: None,
                    name: None,
                    started: false,
                }
            });

            if let Some(id) = &tool_call.id {
                entry.id = Some(id.clone());
            }

            if let Some(function) = &tool_call.function {
                if let Some(name) = &function.name {
                    entry.name = Some(name.clone());
                }
            }

            if !entry.started && entry.id.is_some() && entry.name.is_some() {
                let start = json!({
                    "type": "content_block_start",
                    "index": entry.block_index,
                    "content_block": {
                        "type": "tool_use",
                        "id": entry.id.clone().unwrap_or_default(),
                        "name": entry.name.clone().unwrap_or_default(),
                        "input": {}
                    }
                });
                output.push_str(&format_sse_event("content_block_start", start));
                entry.started = true;
            }

            if let Some(function) = &tool_call.function {
                if let Some(arguments) = &function.arguments {
                    let delta = json!({
                        "type": "content_block_delta",
                        "index": entry.block_index,
                        "delta": {
                            "type": "input_json_delta",
                            "partial_json": arguments
                        }
                    });
                    output.push_str(&format_sse_event("content_block_delta", delta));
                }
            }
        }

        output
    }

    /// Finish the stream and return final events
    pub fn finish(&mut self, reason: Option<&str>) -> String {
        if self.sent_message_stop {
            return String::new();
        }

        let mut output = String::new();

        if let Some(index) = self.text_block_index.take() {
            let stop = json!({
                "type": "content_block_stop",
                "index": index
            });
            output.push_str(&format_sse_event("content_block_stop", stop));
        }

        for entry in self.tool_blocks.values() {
            let stop = json!({
                "type": "content_block_stop",
                "index": entry.block_index
            });
            output.push_str(&format_sse_event("content_block_stop", stop));
        }

        let delta = json!({
            "type": "message_delta",
            "delta": {
                "stop_reason": map_stop_reason(reason),
                "stop_sequence": null
            },
            "usage": {
                "output_tokens": 0
            }
        });
        output.push_str(&format_sse_event("message_delta", delta));

        let stop = json!({ "type": "message_stop" });
        output.push_str(&format_sse_event("message_stop", stop));

        self.sent_message_stop = true;
        output
    }
}

/// Map streaming chunk to Anthropic completion format (legacy)
pub fn map_completion_stream_chunk(chunk: &ChatCompletionStreamChunk, model: &str) -> String {
    let mut output = String::new();
    let model_name = if model.is_empty() {
        chunk.model.clone().unwrap_or_else(|| model.to_string())
    } else {
        model.to_string()
    };
    for choice in &chunk.choices {
        let mut completion = String::new();
        if let Some(content) = &choice.delta.content {
            completion.push_str(content);
        }

        if !completion.is_empty() {
            let data = json!({
                "type": "completion",
                "completion": completion,
                "model": model_name.clone(),
                "stop_reason": Value::Null
            });
            output.push_str(&format_sse_data(data));
        }

        if let Some(reason) = &choice.finish_reason {
            let data = json!({
                "type": "completion",
                "completion": "",
                "model": model_name.clone(),
                "stop_reason": map_stop_reason_complete(Some(reason.as_str()))
            });
            output.push_str(&format_sse_data(data));
        }
    }

    output
}

fn map_stop_reason(reason: Option<&str>) -> String {
    match reason {
        Some("stop") => "end_turn".to_string(),
        Some("length") => "max_tokens".to_string(),
        Some("tool_calls") => "tool_use".to_string(),
        Some(value) => value.to_string(),
        None => "end_turn".to_string(),
    }
}

fn map_stop_reason_complete(reason: Option<&str>) -> String {
    match reason {
        Some("length") => "max_tokens".to_string(),
        Some("stop") => "stop_sequence".to_string(),
        Some(value) => value.to_string(),
        None => "stop_sequence".to_string(),
    }
}
