# Gemini Provider Usage Guide

This guide explains how to use the Google Gemini protocol converter in `agent-llm`.

## 🌟 Gemini API 特点

Gemini API 与 OpenAI/Anthropic 有一些重要区别：

| 特性 | Gemini | OpenAI/Anthropic |
|------|--------|------------------|
| Assistant 角色名称 | `"model"` | `"assistant"` |
| 消息结构 | `contents[]` with `parts[]` | `messages[]` with `content` |
| 系统消息 | `systemInstruction` 字段 | 在 `messages[]` 中 |
| 工具调用 | `function_call` in `parts[]` | `tool_calls[]` array |
| 工具响应 | `function_response` in `parts[]` | role=`"tool"` message |
| 工具定义 | `function_declarations[]` | `tools[]` with `function` |

## 📦 Gemini API 类型

### 请求格式

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {"text": "Hello"}
      ]
    }
  ],
  "systemInstruction": {
    "parts": [
      {"text": "You are helpful"}
    ]
  },
  "tools": [
    {
      "function_declarations": [
        {
          "name": "search",
          "description": "Search the web",
          "parameters": {...}
        }
      ]
    }
  ]
}
```

### 响应格式

```json
{
  "candidates": [
    {
      "content": {
        "role": "model",
        "parts": [
          {"text": "Hello there!"},
          {
            "function_call": {
              "name": "search",
              "args": {"q": "test"}
            }
          }
        ]
      },
      "finish_reason": "STOP"
    }
  ]
}
```

## 🔧 基础用法

### 1. 简单消息转换

```rust
use agent_llm::{FromProvider, ToProvider};
use agent_llm::protocol::gemini::{GeminiContent, GeminiPart};
use agent_core::Message;

// Gemini → Internal
let gemini = GeminiContent {
    role: "user".to_string(),
    parts: vec![GeminiPart {
        text: Some("Hello".to_string()),
        function_call: None,
        function_response: None,
    }],
};

let internal: Message = Message::from_provider(gemini)?;
assert_eq!(internal.role, Role::User);
assert_eq!(internal.content, "Hello");

// Internal → Gemini
let internal = Message::user("Hello");
let gemini: GeminiContent = internal.to_provider()?;
assert_eq!(gemini.role, "user");
assert_eq!(gemini.parts[0].text, Some("Hello".to_string()));
```

### 2. System Message 处理

Gemini 将 system 消息提取到单独的 `systemInstruction` 字段：

```rust
use agent_llm::ToProvider;
use agent_llm::protocol::gemini::GeminiRequest;

let messages = vec![
    Message::system("You are helpful"),
    Message::user("Hello"),
];

let request: GeminiRequest = messages.to_provider()?;

// System message extracted
assert!(request.system_instruction.is_some());
let sys = request.system_instruction.unwrap();
assert_eq!(sys.parts[0].text, Some("You are helpful".to_string()));

// Only user message in contents
assert_eq!(request.contents.len(), 1);
assert_eq!(request.contents[0].role, "user");
```

### 3. 工具调用转换

```rust
// Internal → Gemini (with tool call)
let tool_call = ToolCall {
    id: "call_1".to_string(),
    tool_type: "function".to_string(),
    function: FunctionCall {
        name: "search".to_string(),
        arguments: r#"{"q":"test"}"#.to_string(),
    },
};

let internal = Message::assistant("Let me search", Some(vec![tool_call]));
let gemini: GeminiContent = internal.to_provider()?;

assert_eq!(gemini.role, "model");
assert_eq!(gemini.parts.len(), 2);
assert_eq!(gemini.parts[0].text, Some("Let me search".to_string()));
assert!(gemini.parts[1].function_call.is_some());

let func_call = gemini.parts[1].function_call.as_ref().unwrap();
assert_eq!(func_call.name, "search");
assert_eq!(func_call.args, serde_json::json!({"q": "test"}));
```

### 4. 工具响应转换

```rust
// Internal → Gemini (tool response)
let internal = Message::tool_result("search_tool", r#"{"result": "ok"}"#);
let gemini: GeminiContent = internal.to_provider()?;

assert_eq!(gemini.role, "user"); // Tool responses are user messages
assert!(gemini.parts[0].function_response.is_some());

let func_resp = gemini.parts[0].function_response.as_ref().unwrap();
assert_eq!(func_resp.name, "search_tool");
assert_eq!(func_resp.response, serde_json::json!({"result": "ok"}));
```

## 🛠️ 工具定义转换

### 单个工具

```rust
let schema = ToolSchema {
    schema_type: "function".to_string(),
    function: FunctionSchema {
        name: "search".to_string(),
        description: "Search the web".to_string(),
        parameters: serde_json::json!({
            "type": "object",
            "properties": {
                "q": { "type": "string" }
            }
        }),
    },
};

let gemini_tool: GeminiTool = schema.to_provider()?;
assert_eq!(gemini_tool.function_declarations.len(), 1);
assert_eq!(gemini_tool.function_declarations[0].name, "search");
```

### 多个工具（Gemini 特殊处理）

Gemini 将所有工具定义分组到一个 `GeminiTool` 中：

```rust
let tools = vec![
    ToolSchema { /* search */ },
    ToolSchema { /* read */ },
    ToolSchema { /* write */ },
];

let gemini_tools: Vec<GeminiTool> = tools.to_provider()?;

// All tools grouped into one
assert_eq!(gemini_tools.len(), 1);
assert_eq!(gemini_tools[0].function_declarations.len(), 3);
```

## 🔄 跨协议转换示例

### OpenAI → Gemini

```rust
// Step 1: OpenAI → Internal
let openai_msg = OpenAIChatMessage {
    role: Role::User,
    content: Content::Text("Hello".to_string()),
    tool_calls: None,
    tool_call_id: None,
};

let internal: Message = Message::from_provider(openai_msg)?;

// Step 2: Internal → Gemini
let gemini: GeminiContent = internal.to_provider()?;
assert_eq!(gemini.role, "user");
```

### Anthropic → Gemini

```rust
// Step 1: Anthropic → Internal
let anthropic_msg = AnthropicMessage {
    role: AnthropicRole::User,
    content: AnthropicContent::Text("Hello".to_string()),
};

let internal: Message = Message::from_provider(anthropic_msg)?;

// Step 2: Internal → Gemini
let gemini: GeminiContent = internal.to_provider()?;
assert_eq!(gemini.role, "user");
```

## 📝 完整示例：构建 Gemini 请求

```rust
use agent_llm::{ToProvider, GeminiProtocol};
use agent_llm::protocol::gemini::{GeminiRequest, GeminiTool};
use agent_core::{Message, tools::ToolSchema};

fn build_gemini_request() -> ProtocolResult<GeminiRequest> {
    // 1. Create messages
    let messages = vec![
        Message::system("You are a helpful assistant"),
        Message::user("What's the weather?"),
    ];

    // 2. Create tools
    let tools = vec![
        ToolSchema {
            schema_type: "function".to_string(),
            function: FunctionSchema {
                name: "get_weather".to_string(),
                description: "Get weather info".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "location": { "type": "string" }
                    },
                    "required": ["location"]
                }),
            },
        },
    ];

    // 3. Build request
    let mut request: GeminiRequest = messages.to_provider()?;

    // 4. Add tools
    request.tools = Some(tools.to_provider()?);

    // 5. Add generation config (optional)
    request.generation_config = Some(serde_json::json!({
        "temperature": 0.7,
        "maxOutputTokens": 1024,
    }));

    Ok(request)
}
```

## ⚠️ 重要注意事项

### 1. Role 映射

| Internal | Gemini |
|----------|--------|
| `User` | `"user"` |
| `Assistant` | `"model"` |
| `System` | `systemInstruction` |
| `Tool` | `"user"` (with `function_response`) |

### 2. Tool Call IDs

- **Gemini 不提供 tool call IDs**
- 转换时会自动生成 UUID：`"gemini_{uuid}"`
- 工具响应时使用工具名称作为 ID

### 3. Content Parts

- Gemini 的 `parts[]` 是数组，可以包含多个元素
- 文本、工具调用、工具响应都是独立的 part
- 空 content 会生成一个空文本 part

### 4. Tool Declarations

- Gemini 将所有工具定义放在一个 `GeminiTool` 中
- 与 OpenAI/Anthropic 的 `tools[]` 数组不同

## 🧪 测试

运行 Gemini 协议测试：

```bash
# 所有 Gemini 测试
cargo test -p agent-llm --lib protocol::gemini

# 特定测试
cargo test -p agent-llm --lib protocol::gemini::tests::test_roundtrip_conversion
```

## 🔗 相关文件

- `protocol/gemini.rs` - 实现代码
- `protocol/mod.rs` - Trait 定义
- `PROTOCOL_ARCHITECTURE.md` - 架构文档

## 💡 最佳实践

1. **使用批量转换**：对于多个消息，使用 `Vec<Message>.to_provider()`
2. **处理 System 消息**：确保正确提取到 `systemInstruction`
3. **验证 Parts**：Gemini 要求至少一个 part，空消息会自动添加
4. **工具分组**：记住 Gemini 将所有工具分组到一个对象

## 🚀 下一步

- 实现 `GeminiProvider` struct
- 添加流式响应支持
- 添加重试逻辑和错误处理
- 集成到 `LLMProvider` trait
