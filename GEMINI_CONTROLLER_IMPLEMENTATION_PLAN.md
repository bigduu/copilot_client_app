# Gemini Controller 实现方案

## 目标

添加 Gemini 原生 API 格式的端点，支持 Google Gemini SDK 直接调用。

## API 端点设计

### Gemini API 格式

根据 [Gemini API 文档](https://ai.google.dev/tutorials/rest_quickstart)，主要端点：

```
POST /gemini/v1beta/models/{model}:generateContent
POST /gemini/v1beta/models/{model}:streamGenerateContent
GET  /gemini/v1beta/models
```

### 路由配置

```rust
// server.rs
pub fn app_config(cfg: &mut web::ServiceConfig) {
    // ... existing endpoints

    // Gemini 格式
    cfg.service(
        web::scope("/gemini/v1beta")
            .configure(gemini_controller::config)
    );
}
```

## 实现步骤

### Step 1: 创建 Gemini Controller

**文件**: `crates/web_service/src/controllers/gemini/mod.rs`

```rust
use actix_web::{get, post, web, HttpResponse};
use agent_core::Message;
use agent_llm::protocol::{FromProvider, ToProvider};
use agent_llm::protocol::gemini::{
    GeminiRequest, GeminiResponse, GeminiStreamChunk, GeminiContent, GeminiPart
};
use crate::{error::AppError, server::AppState};

pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/models")
            .route("/{model}:generateContent", web::post().to(generate_content))
            .route("/{model}:streamGenerateContent", web::post().to(stream_generate_content))
            .route("", web::get().to(list_models))
    );
}

/// Generate content (non-streaming)
#[post("/{model}:generateContent")]
pub async fn generate_content(
    path: web::Path<String>,
    request: web::Json<GeminiRequest>,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let model = path.into_inner();

    // 1. Gemini 格式 → Message
    let internal_messages: Vec<Message> = request.contents
        .iter()
        .map(|content| Message::from_provider(content.clone()))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| AppError::BadRequest(format!("Invalid request: {}", e)))?;

    // 2. 调用 Provider (任何 provider 都可以)
    let provider = state.get_provider().await;

    // 对于非流式请求，我们需要收集所有输出
    let mut stream = provider.chat_stream(&internal_messages, &[], None)
        .await
        .map_err(|e| AppError::InternalError(anyhow::anyhow!("Provider error: {}", e)))?;

    // 3. 收集响应并转换为 Gemini 格式
    let mut full_content = String::new();
    while let Some(chunk) = stream.recv().await {
        match chunk {
            Ok(llm_chunk) => match llm_chunk {
                agent_llm::LLMChunk::Token(token) => full_content.push_str(&token),
                agent_llm::LLMChunk::Done => break,
                _ => {}
            },
            Err(e) => return Err(AppError::InternalError(anyhow::anyhow!("Stream error: {}", e))),
        }
    }

    // 4. Message → Gemini 格式
    let gemini_response = GeminiResponse {
        candidates: vec![/* ... */],
        usage_metadata: Some(/* ... */),
    };

    Ok(HttpResponse::Ok().json(gemini_response))
}

/// Stream generate content
#[post("/{model}:streamGenerateContent")]
pub async fn stream_generate_content(
    path: web::Path<String>,
    request: web::Json<GeminiRequest>,
    state: web::Data<AppState>,
) -> HttpResponse {
    // 1. Gemini 格式 → Message
    let internal_messages = match request.contents
        .iter()
        .map(|content| Message::from_provider(content.clone()))
        .collect::<Result<Vec<_>, _>>()
    {
        Ok(msgs) => msgs,
        Err(e) => return HttpResponse::BadRequest().body(format!("Invalid request: {}", e)),
    };

    // 2. 调用 Provider
    let provider = match state.get_provider().await.chat_stream(&internal_messages, &[], None).await {
        Ok(stream) => stream,
        Err(e) => return HttpResponse::InternalServerError().body(format!("Provider error: {}", e)),
    };

    // 3. 转换为 Gemini SSE 流
    let gemini_stream = async_stream::stream! {
        let mut stream = provider;

        while let Some(chunk) = stream.recv().await {
            match chunk {
                Ok(llm_chunk) => {
                    // LLMChunk → GeminiStreamChunk
                    let gemini_chunk = match llm_chunk {
                        agent_llm::LLMChunk::Token(token) => GeminiStreamChunk {
                            candidates: vec![GeminiContent {
                                role: "model".to_string(),
                                parts: vec![GeminiPart::Text { text: token }],
                            }],
                            usage_metadata: None,
                        },
                        agent_llm::LLMChunk::Done => break,
                        agent_llm::LLMChunk::ToolCalls(_) => continue, // 暂时忽略
                    };

                    yield Ok::<_, String>(serde_json::to_string(&gemini_chunk).unwrap());
                }
                Err(e) => {
                    yield Err(format!("Stream error: {}", e));
                    break;
                }
            }
        }
    };

    HttpResponse::Ok()
        .content_type("text/event-stream")
        .streaming(gemini_stream.map(|result| {
            match result {
                Ok(json) => Ok(Bytes::from(format!("data: {}\n\n", json))),
                Err(e) => Err(actix_web::Error::from(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    e,
                ))),
            }
        }))
}

/// List available models
#[get("/models")]
pub async fn list_models(
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let provider = state.get_provider().await;

    let models = provider.list_models().await
        .map_err(|e| AppError::InternalError(anyhow::anyhow!("Failed to list models: {}", e)))?;

    // 转换为 Gemini 格式的模型列表
    let gemini_models = models.into_iter().map(|name| {
        json!({
            "name": format!("models/{}", name),
            "displayName": name,
            "supportedGenerationMethods": ["generateContent", "streamGenerateContent"],
        })
    }).collect::<Vec<_>>();

    Ok(HttpResponse::Ok().json(json!({
        "models": gemini_models
    })))
}
```

### Step 2: 使用 Protocol 模块

**关键点**: Controller 使用 `protocol` 模块来转换格式

```rust
use agent_llm::protocol::{FromProvider, ToProvider};
use agent_llm::protocol::gemini::{GeminiRequest, GeminiResponse, ...};

// Gemini 格式 → Message
let internal_messages: Vec<Message> = request.contents
    .iter()
    .map(|content| Message::from_provider(content.clone()))  // 使用 protocol trait
    .collect()?;

// Message → Gemini 格式
let gemini_response: GeminiResponse = internal_messages.to_provider_batch()?;
```

### Step 3: 更新 Controllers mod.rs

```rust
// controllers/mod.rs
pub mod anthropic;
pub mod gemini;  // 新增
pub mod openai_controller;
pub mod settings_controller;
// ...

pub use gemini;
```

### Step 4: 更新 server.rs

```rust
// server.rs
use crate::controllers::gemini as gemini_controller;

pub fn app_config(cfg: &mut web::ServiceConfig) {
    // OpenAI 格式
    cfg.service(
        web::scope("/v1")
            .configure(openai_controller::config)
            .configure(settings_controller::config)
            // ...
    );

    // Anthropic 格式
    cfg.service(
        web::scope("/anthropic/v1")
            .configure(anthropic_controller::config)
    );

    // Gemini 格式 (新增)
    cfg.service(
        web::scope("/gemini/v1beta")
            .configure(gemini_controller::config)
    );
}
```

## Protocol 的关键作用

### 如果 Protocol 在 Provider 内部 ❌

```rust
// ❌ 无法访问 provider 内部
use agent_llm::providers::gemini::protocol::FromProvider;  // 编译错误！

// ❌ Controller 无法使用
// ❌ 需要在 controller 中重复实现转换逻辑
fn convert_gemini_to_message(content: GeminiContent) -> Message {
    // 复制粘贴 protocol/gemini.rs 的代码...
    // 违反 DRY 原则
}
```

### Protocol 独立 ✅

```rust
// ✅ Controller 可以自由使用
use agent_llm::protocol::{FromProvider, ToProvider};
use agent_llm::protocol::gemini::{GeminiContent, GeminiPart};

// ✅ 一处实现，多处使用
// ✅ Provider 内部用，Controller 也用
// ✅ 保持 DRY
let message = Message::from_provider(gemini_content)?;
```

## 测试用例

```bash
# 测试 Gemini 端点

# 1. 非流式请求
curl -X POST http://localhost:8080/gemini/v1beta/models/gemini-pro:generateContent \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [{
        "text": "Hello, how are you?"
      }]
    }]
  }'

# 2. 流式请求
curl -X POST http://localhost:8080/gemini/v1beta/models/gemini-pro:streamGenerateContent \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [{
        "text": "Tell me a story"
      }]
    }]
  }'

# 3. 列出模型
curl http://localhost:8080/gemini/v1beta/models
```

## 架构对比图

### Before (缺少 Gemini 端点)
```
用户 → OpenAI SDK → /v1/chat/completions → OpenAI Controller
用户 → Anthropic SDK → /anthropic/v1/messages → Anthropic Controller
用户 → Gemini SDK → ❌ 404 Not Found
```

### After (添加 Gemini 端点)
```
用户 → OpenAI SDK → /v1/chat/completions → OpenAI Controller
                                              ↓
                                        Protocol Layer (独立)
                                              ↓
                                        Provider Layer (任何 provider)

用户 → Anthropic SDK → /anthropic/v1/messages → Anthropic Controller
                                              ↓
                                        Protocol Layer (共享)
                                              ↓
                                        Provider Layer (任何 provider)

用户 → Gemini SDK → /gemini/v1beta/models/{model}:generateContent
                                              ↓
                                     Gemini Controller (新增)
                                              ↓
                                        Protocol Layer (复用) ⭐
                                              ↓
                                        Provider Layer (任何 provider)
```

## 关键收益

1. ✅ **支持 Gemini 原生 API** - Google SDK 可以直接调用
2. ✅ **Protocol 层复用** - Gemini controller 使用相同的 protocol
3. ✅ **Provider 灵活性** - Gemini 端点可以使用任何底层 provider
4. ✅ **代码复用** - 不需要在 controller 中重复实现转换逻辑

## 结论

**添加 Gemini Controller 进一步证明了 protocol 独立架构的正确性**：

1. ✅ 每个协议格式需要一个 controller
2. ✅ 所有 controller 共享 protocol 转换层
3. ✅ 如果 protocol 在 provider 内部，controller 无法使用
4. ✅ 保持 protocol 独立是支持多协议 API 的唯一可行方案

---

**下一步**: 实现 Gemini Controller 并添加到项目中。
