use copilot_client::api::models::{
    ChatCompletionStreamChunk, StreamChoice, StreamDelta, StreamFunctionCall, StreamToolCall,
};
use copilot_client::api::stream_tool_accumulator::StreamToolAccumulator;

/// Test deserialization of partial tool call chunks
/// These are the actual chunks from the error logs that were failing to parse
#[test]
fn test_deserialize_partial_tool_call_chunks() {
    // First chunk with function arguments only (no name)
    let chunk1 = r#"{"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"function":{"arguments":"{\""},"index":0}]}}],"created":1765103285,"id":"chatcmpl-Ck6HlACvhDwV4wEudRGDdDgRiaLap","model":"gpt-4.1-2025-04-14","system_fingerprint":"fp_f99638a8d7"}"#;

    // Second chunk with more arguments
    let chunk2 = r#"{"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"function":{"arguments":"depth"},"index":0}]}}],"created":1765103285,"id":"chatcmpl-Ck6HlACvhDwV4wEudRGDdDgRiaLap","model":"gpt-4.1-2025-04-14","system_fingerprint":"fp_f99638a8d7"}"#;

    // Third chunk
    let chunk3 = r#"{"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"function":{"arguments":"\":\""},"index":0}]}}],"created":1765103285,"id":"chatcmpl-Ck6HlACvhDwV4wEudRGDdDgRiaLap","model":"gpt-4.1-2025-04-14","system_fingerprint":"fp_f99638a8d7"}"#;

    // All should deserialize successfully now
    let result1: Result<ChatCompletionStreamChunk, _> = serde_json::from_str(chunk1);
    let result2: Result<ChatCompletionStreamChunk, _> = serde_json::from_str(chunk2);
    let result3: Result<ChatCompletionStreamChunk, _> = serde_json::from_str(chunk3);

    assert!(
        result1.is_ok(),
        "Failed to parse chunk1: {:?}",
        result1.err()
    );
    assert!(
        result2.is_ok(),
        "Failed to parse chunk2: {:?}",
        result2.err()
    );
    assert!(
        result3.is_ok(),
        "Failed to parse chunk3: {:?}",
        result3.err()
    );

    // Verify the structure
    let parsed1 = result1.unwrap();
    assert!(parsed1.choices[0].delta.tool_calls.is_some());
    let tool_calls = parsed1.choices[0].delta.tool_calls.as_ref().unwrap();
    assert_eq!(tool_calls.len(), 1);
    assert_eq!(tool_calls[0].index, 0);
}

/// Test all chunks from the actual error logs
#[test]
fn test_all_error_log_chunks() {
    let chunks = vec![
        r#"{"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"function":{"arguments":"{\""},"index":0}]}}],"created":1765103285,"id":"chatcmpl-Ck6HlACvhDwV4wEudRGDdDgRiaLap","model":"gpt-4.1-2025-04-14","system_fingerprint":"fp_f99638a8d7"}"#,
        r#"{"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"function":{"arguments":"depth"},"index":0}]}}],"created":1765103285,"id":"chatcmpl-Ck6HlACvhDwV4wEudRGDdDgRiaLap","model":"gpt-4.1-2025-04-14","system_fingerprint":"fp_f99638a8d7"}"#,
        r#"{"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"function":{"arguments":"\":\""},"index":0}]}}],"created":1765103285,"id":"chatcmpl-Ck6HlACvhDwV4wEudRGDdDgRiaLap","model":"gpt-4.1-2025-04-14","system_fingerprint":"fp_f99638a8d7"}"#,
        r#"{"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"function":{"arguments":"2"},"index":0}]}}],"created":1765103285,"id":"chatcmpl-Ck6HlACvhDwV4wEudRGDdDgRiaLap","model":"gpt-4.1-2025-04-14","system_fingerprint":"fp_f99638a8d7"}"#,
        r#"{"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"function":{"arguments":"\",\""},"index":0}]}}],"created":1765103285,"id":"chatcmpl-Ck6HlACvhDwV4wEudRGDdDgRiaLap","model":"gpt-4.1-2025-04-14","system_fingerprint":"fp_f99638a8d7"}"#,
        r#"{"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"function":{"arguments":"path"},"index":0}]}}],"created":1765103285,"id":"chatcmpl-Ck6HlACvhDwV4wEudRGDdDgRiaLap","model":"gpt-4.1-2025-04-14","system_fingerprint":"fp_f99638a8d7"}"#,
        r#"{"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"function":{"arguments":"\":\""},"index":0}]}}],"created":1765103285,"id":"chatcmpl-Ck6HlACvhDwV4wEudRGDdDgRiaLap","model":"gpt-4.1-2025-04-14","system_fingerprint":"fp_f99638a8d7"}"#,
        r#"{"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"function":{"arguments":".\""},"index":0}]}}],"created":1765103285,"id":"chatcmpl-Ck6HlACvhDwV4wEudRGDdDgRiaLap","model":"gpt-4.1-2025-04-14","system_fingerprint":"fp_f99638a8d7"}"#,
        r#"{"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"function":{"arguments":"}"},"index":0}]}}],"created":1765103285,"id":"chatcmpl-Ck6HlACvhDwV4wEudRGDdDgRiaLap","model":"gpt-4.1-2025-04-14","system_fingerprint":"fp_f99638a8d7"}"#,
    ];

    for (i, chunk_str) in chunks.iter().enumerate() {
        let result: Result<ChatCompletionStreamChunk, _> = serde_json::from_str(chunk_str);
        assert!(
            result.is_ok(),
            "Failed to parse chunk {}: {:?}",
            i,
            result.err()
        );
    }
}

/// Test accumulation of tool calls from the error log chunks
#[test]
fn test_accumulate_error_log_chunks() {
    let chunks_data = vec![
        r#"{"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"id":"call_abc","type":"function","function":{"name":"find_by_name","arguments":"{\""},"index":0}]}}],"created":1765103285,"id":"chatcmpl-Ck6HlACvhDwV4wEudRGDdDgRiaLap","model":"gpt-4.1-2025-04-14"}"#,
        r#"{"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"function":{"arguments":"depth"},"index":0}]}}],"created":1765103285,"id":"test"}"#,
        r#"{"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"function":{"arguments":"\":\""},"index":0}]}}],"created":1765103285,"id":"test"}"#,
        r#"{"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"function":{"arguments":"2"},"index":0}]}}],"created":1765103285,"id":"test"}"#,
        r#"{"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"function":{"arguments":"\",\""},"index":0}]}}],"created":1765103285,"id":"test"}"#,
        r#"{"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"function":{"arguments":"path"},"index":0}]}}],"created":1765103285,"id":"test"}"#,
        r#"{"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"function":{"arguments":"\":\""},"index":0}]}}],"created":1765103285,"id":"test"}"#,
        r#"{"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"function":{"arguments":".\""},"index":0}]}}],"created":1765103285,"id":"test"}"#,
        r#"{"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"function":{"arguments":"}"},"index":0}]}}],"created":1765103285,"id":"test"}"#,
    ];

    let mut accumulator = StreamToolAccumulator::new();

    for chunk_str in chunks_data {
        let chunk: ChatCompletionStreamChunk = serde_json::from_str(chunk_str).unwrap();
        if let Some(choice) = chunk.choices.first() {
            if let Some(tool_calls) = &choice.delta.tool_calls {
                accumulator.process_chunk(tool_calls);
            }
        }
    }

    let tool_calls = accumulator.into_tool_calls();
    assert_eq!(tool_calls.len(), 1);
    assert_eq!(tool_calls[0].id, "call_abc");
    assert_eq!(tool_calls[0].function.name, "find_by_name");
    assert_eq!(
        tool_calls[0].function.arguments,
        r#"{"depth":"2","path":"."}"#
    );
}

/// Test complete streaming flow with metadata chunk followed by argument chunks
#[test]
fn test_complete_streaming_flow() {
    let mut accumulator = StreamToolAccumulator::new();

    // Chunk 1: Initial metadata with id, type, and function name
    let chunk1 = ChatCompletionStreamChunk {
        id: "chatcmpl-123".to_string(),
        object: Some("chat.completion.chunk".to_string()),
        created: 1234567890,
        model: Some("gpt-4".to_string()),
        choices: vec![StreamChoice {
            index: 0,
            delta: StreamDelta {
                role: None,
                content: None,
                tool_calls: Some(vec![StreamToolCall {
                    index: 0,
                    id: Some("call_xyz".to_string()),
                    tool_type: Some("function".to_string()),
                    function: Some(StreamFunctionCall {
                        name: Some("search_files".to_string()),
                        arguments: Some("".to_string()),
                    }),
                }]),
            },
            finish_reason: None,
        }],
    };

    // Chunk 2-5: Just argument fragments
    let arg_chunks = vec![
        r#"{"query""#,
        r#":"test""#,
        r#","max_results""#,
        r#":10}"#,
    ];

    accumulator.process_chunk(&chunk1.choices[0].delta.tool_calls.as_ref().unwrap());

    for arg in arg_chunks {
        let chunk = ChatCompletionStreamChunk {
            id: "chatcmpl-123".to_string(),
            object: None,
            created: 1234567890,
            model: None,
            choices: vec![StreamChoice {
                index: 0,
                delta: StreamDelta {
                    role: None,
                    content: None,
                    tool_calls: Some(vec![StreamToolCall {
                        index: 0,
                        id: None,
                        tool_type: None,
                        function: Some(StreamFunctionCall {
                            name: None,
                            arguments: Some(arg.to_string()),
                        }),
                    }]),
                },
                finish_reason: None,
            }],
        };

        accumulator.process_chunk(&chunk.choices[0].delta.tool_calls.as_ref().unwrap());
    }

    let tool_calls = accumulator.into_tool_calls();
    assert_eq!(tool_calls.len(), 1);
    assert_eq!(tool_calls[0].id, "call_xyz");
    assert_eq!(tool_calls[0].function.name, "search_files");
    assert_eq!(
        tool_calls[0].function.arguments,
        r#"{"query":"test","max_results":10}"#
    );
}

/// Test multiple concurrent tool calls being streamed
#[test]
fn test_multiple_concurrent_tool_calls() {
    let mut accumulator = StreamToolAccumulator::new();

    // Initial chunk with two tool calls
    accumulator.process_chunk(&[
        StreamToolCall {
            index: 0,
            id: Some("call_1".to_string()),
            tool_type: Some("function".to_string()),
            function: Some(StreamFunctionCall {
                name: Some("list_files".to_string()),
                arguments: Some("{".to_string()),
            }),
        },
        StreamToolCall {
            index: 1,
            id: Some("call_2".to_string()),
            tool_type: Some("function".to_string()),
            function: Some(StreamFunctionCall {
                name: Some("read_file".to_string()),
                arguments: Some("{".to_string()),
            }),
        },
    ]);

    // Interleaved argument chunks
    accumulator.process_chunk(&[
        StreamToolCall {
            index: 0,
            id: None,
            tool_type: None,
            function: Some(StreamFunctionCall {
                name: None,
                arguments: Some("\"dir\":\"src\"".to_string()),
            }),
        },
        StreamToolCall {
            index: 1,
            id: None,
            tool_type: None,
            function: Some(StreamFunctionCall {
                name: None,
                arguments: Some("\"path\":\"main.rs\"".to_string()),
            }),
        },
    ]);

    accumulator.process_chunk(&[
        StreamToolCall {
            index: 0,
            id: None,
            tool_type: None,
            function: Some(StreamFunctionCall {
                name: None,
                arguments: Some("}".to_string()),
            }),
        },
        StreamToolCall {
            index: 1,
            id: None,
            tool_type: None,
            function: Some(StreamFunctionCall {
                name: None,
                arguments: Some("}".to_string()),
            }),
        },
    ]);

    let tool_calls = accumulator.into_tool_calls();
    assert_eq!(tool_calls.len(), 2);

    // Verify they're in order by index
    assert_eq!(tool_calls[0].id, "call_1");
    assert_eq!(tool_calls[0].function.name, "list_files");
    assert_eq!(tool_calls[0].function.arguments, r#"{"dir":"src"}"#);

    assert_eq!(tool_calls[1].id, "call_2");
    assert_eq!(tool_calls[1].function.name, "read_file");
    assert_eq!(tool_calls[1].function.arguments, r#"{"path":"main.rs"}"#);
}
