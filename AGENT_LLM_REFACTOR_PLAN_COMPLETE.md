# Agent-LLM Crate 完整重构方案

## 目标

清理 agent-llm crate 的架构混乱，删除冗余代码，集成 masking 功能到所有 providers。

## 重构任务清单

### Phase 1: 添加 Masking 装饰器 (新功能)

#### 任务 1.1: 创建 MaskingProviderDecorator
**文件**: `crates/agent-llm/src/providers/common/masking_decorator.rs` (新建)

```rust
use chat_core::keyword_masking::KeywordMaskingConfig;
use crate::provider::{LLMProvider, LLMStream, Result};
use agent_core::{tools::ToolSchema, Message};
use async_trait::async_trait;

pub struct MaskingProviderDecorator<P: LLMProvider> {
    inner: P,
    masking_config: KeywordMaskingConfig,
}

impl<P: LLMProvider> MaskingProviderDecorator<P> {
    pub fn new(inner: P, masking_config: KeywordMaskingConfig) -> Self {
        Self { inner, masking_config }
    }
}

#[async_trait]
impl<P: LLMProvider> LLMProvider for MaskingProviderDecorator<P> {
    async fn chat_stream(
        &self,
        messages: &[Message],
        tools: &[ToolSchema],
        max_output_tokens: Option<u32>,
    ) -> Result<LLMStream> {
        if !self.masking_config.entries.is_empty() {
            let masked_messages: Vec<Message> = messages
                .iter()
                .map(|m| {
                    let mut masked = m.clone();
                    masked.content = self.masking_config.apply_masking(&m.content);
                    masked
                })
                .collect();

            log::debug!("Applied keyword masking to {} messages", messages.len());
            self.inner.chat_stream(&masked_messages, tools, max_output_tokens).await
        } else {
            self.inner.chat_stream(messages, tools, max_output_tokens).await
        }
    }

    async fn list_models(&self) -> Result<Vec<String>> {
        self.inner.list_models().await
    }
}
```

#### 任务 1.2: 在 common/mod.rs 中导出
**文件**: `crates/agent-llm/src/providers/common/mod.rs`

```rust
//! Shared helpers for provider implementations.

pub mod masking_decorator;  // 添加
pub mod openai_compat;
pub mod sse;

pub use masking_decorator::MaskingProviderDecorator;  // 添加
```

#### 任务 1.3: 在 provider_factory 中使用装饰器
**文件**: `crates/agent-llm/src/provider_factory.rs`

添加导入：
```rust
use crate::providers::common::MaskingProviderDecorator;
use chat_core::keyword_masking::KeywordMaskingConfig;
use chat_core::paths::keyword_masking_json_path;
```

添加辅助函数：
```rust
/// Load keyword masking configuration
fn load_masking_config() -> KeywordMaskingConfig {
    let path = keyword_masking_json_path();
    if !path.exists() {
        log::debug!("No keyword masking config found, using default");
        return KeywordMaskingConfig::default();
    }

    match std::fs::read_to_string(&path) {
        Ok(content) => {
            match serde_json::from_str(&content) {
                Ok(config) => {
                    log::info!("Loaded keyword masking config with {} entries", config.entries.len());
                    config
                }
                Err(e) => {
                    log::warn!("Failed to parse masking config: {}", e);
                    KeywordMaskingConfig::default()
                }
            }
        }
        Err(e) => {
            log::warn!("Failed to read masking config: {}", e);
            KeywordMaskingConfig::default()
        }
    }
}
```

修改 `create_provider` 函数：
```rust
pub async fn create_provider(config: &Config) -> Result<Arc<dyn LLMProvider>, LLMError> {
    // Load masking config (applies to all providers)
    let masking_config = load_masking_config();

    // Create base provider
    let base_provider = match config.provider.as_str() {
        "copilot" => {
            let mut provider = CopilotProvider::new();
            if let Err(e) = provider.try_authenticate_silent().await {
                log::warn!("Copilot silent authentication failed: {}", e);
            }
            provider
        }

        "openai" => {
            let openai_config = config
                .providers
                .openai
                .as_ref()
                .ok_or_else(|| LLMError::Auth("OpenAI configuration required".to_string()))?;

            if openai_config.api_key.is_empty() {
                return Err(LLMError::Auth("OpenAI API key is required".to_string()));
            }

            let mut provider = OpenAIProvider::new(&openai_config.api_key);

            if let Some(base_url) = &openai_config.base_url {
                if !base_url.is_empty() {
                    provider = provider.with_base_url(base_url);
                }
            }

            if let Some(model) = &openai_config.model {
                if !model.is_empty() {
                    provider = provider.with_model(model);
                }
            }

            provider
        }

        "anthropic" => {
            let anthropic_config = config
                .providers
                .anthropic
                .as_ref()
                .ok_or_else(|| LLMError::Auth("Anthropic configuration required".to_string()))?;

            if anthropic_config.api_key.is_empty() {
                return Err(LLMError::Auth("Anthropic API key is required".to_string()));
            }

            let mut provider = AnthropicProvider::new(&anthropic_config.api_key);

            if let Some(base_url) = &anthropic_config.base_url {
                if !base_url.is_empty() {
                    provider = provider.with_base_url(base_url);
                }
            }

            if let Some(model) = &anthropic_config.model {
                if !model.is_empty() {
                    provider = provider.with_model(model);
                }
            }

            if let Some(max_tokens) = anthropic_config.max_tokens {
                provider = provider.with_max_tokens(max_tokens);
            }

            provider
        }

        "gemini" => {
            let gemini_config = config
                .providers
                .gemini
                .as_ref()
                .ok_or_else(|| LLMError::Auth("Gemini configuration required".to_string()))?;

            if gemini_config.api_key.is_empty() {
                return Err(LLMError::Auth("Gemini API key is required".to_string()));
            }

            let mut provider = GeminiProvider::new(&gemini_config.api_key);

            if let Some(base_url) = &gemini_config.base_url {
                if !base_url.is_empty() {
                    provider = provider.with_base_url(base_url);
                }
            }

            if let Some(model) = &gemini_config.model {
                if !model.is_empty() {
                    provider = provider.with_model(model);
                }
            }

            provider
        }

        _ => Err(LLMError::Auth(format!(
            "Unknown provider: {}. Available providers: {}",
            config.provider,
            AVAILABLE_PROVIDERS.join(", ")
        )))?,
    };

    // Wrap with masking decorator (applies to all providers)
    let masked_provider = MaskingProviderDecorator::new(base_provider, masking_config);

    Ok(Arc::new(masked_provider))
}
```

### Phase 2: 删除冗余文件

#### 任务 2.1: 删除 masking.rs
```bash
rm crates/agent-llm/src/masking.rs
```

原因：只是包装函数，功能已集成到装饰器

#### 任务 2.2: 删除 openai.rs
```bash
rm crates/agent-llm/src/openai.rs
```

原因：只有 3 行 re-export，无意义

#### 任务 2.3: 删除旧的 client 系统
```bash
rm crates/agent-llm/src/client/mod.rs
rm crates/agent-llm/src/client/decorator.rs
rm crates/agent-llm/src/client/models_handler.rs
rm crates/agent-llm/src/client_trait.rs
```

原因：被新的 Provider 系统替代

#### 任务 2.4: 移动 stream_tool_accumulator
```bash
mv crates/agent-llm/src/client/stream_tool_accumulator.rs \
   crates/agent-llm/src/providers/common/stream_tool_accumulator.rs
```

原因：是 OpenAI 兼容格式专用的，应该在 providers/common/

### Phase 3: 移动 Auth 到 Copilot 内部

#### 任务 3.1: 创建 copilot/auth 目录结构
```bash
mkdir -p crates/agent-llm/src/providers/copilot/auth
```

#### 任务 3.2: 移动 auth 文件
```bash
mv crates/agent-llm/src/auth/mod.rs \
   crates/agent-llm/src/providers/copilot/auth/mod.rs

mv crates/agent-llm/src/auth/handler.rs \
   crates/agent-llm/src/providers/copilot/auth/handler.rs

mv crates/agent-llm/src/auth/token.rs \
   crates/agent-llm/src/providers/copilot/auth/token.rs

mv crates/agent-llm/src/auth/device_code.rs \
   crates/agent-llm/src/providers/copilot/auth/device_code.rs

mv crates/agent-llm/src/auth/cache.rs \
   crates/agent-llm/src/providers/copilot/auth/cache.rs
```

#### 任务 3.3: 更新所有引用
**文件**: `crates/agent-llm/src/providers/copilot/mod.rs`

修改：
```rust
// 旧
use crate::auth::{
    get_copilot_token, get_device_code, poll_access_token, present_device_code, TokenCache,
};

// 新
mod auth;
use auth::{
    get_copilot_token, get_device_code, poll_access_token, present_device_code, TokenCache,
};
```

### Phase 4: 清理 lib.rs 导出

#### 任务 4.1: 更新 lib.rs
**文件**: `crates/agent-llm/src/lib.rs`

```rust
// 删除这些行
pub mod auth;  // ❌
pub mod client;  // ❌
pub mod client_trait;  // ❌
pub mod masking;  // ❌
pub mod openai;  // ❌

pub use auth::{CopilotAuthHandler, CopilotToken, TokenCache};  // ❌
pub use client::{CopilotClient, MetricsClientDecorator};  // ❌
pub use client_trait::CopilotClientTrait;  // ❌
pub use masking::apply_masking;  // ❌
pub use openai::OpenAIProvider;  // ❌

// 保留并更新
pub mod error;
pub mod models;
pub mod protocol;
pub mod provider;
pub mod providers;
pub mod types;

pub mod api {
    pub mod models {
        pub use crate::models::*;
    }

    pub mod stream_tool_accumulator {
        pub use crate::providers::common::stream_tool_accumulator::*;  // 更新路径
    }
}

pub mod provider_factory;

pub use chat_core::Config;
pub use error::ProxyAuthRequiredError;
pub use models::*;
pub use protocol::{AnthropicProtocol, GeminiProtocol, OpenAIProtocol, FromProvider, ToProvider, ProtocolError, ProtocolResult};
pub use provider::{LLMError, LLMProvider, LLMStream};
pub use provider_factory::{create_provider, validate_provider_config, AVAILABLE_PROVIDERS};
pub use providers::{AnthropicProvider, CopilotProvider, GeminiProvider, OpenAIProvider};
pub use types::LLMChunk;
```

#### 任务 4.2: 更新 client 模块（如果需要保留 stream_tool_accumulator）
**文件**: `crates/agent-llm/src/client/mod.rs` (如果还存在)

更新为：
```rust
// 重定向到新位置
pub use crate::providers::common::stream_tool_accumulator::*;
```

或者完全删除 client 目录，只在 providers/common 中保留。

### Phase 5: 更新测试

#### 任务 5.1: 查找所有使用旧 API 的测试
```bash
grep -r "CopilotClient" crates/*/tests/
grep -r "CopilotClientTrait" crates/*/tests/
```

#### 任务 5.2: 更新测试使用新架构
将 mock `CopilotClientTrait` 改为 mock `LLMProvider`

### Phase 6: 验证

#### 任务 6.1: 编译检查
```bash
cargo build -p agent-llm
cargo build -p web_service
```

#### 任务 6.2: 运行测试
```bash
cargo test -p agent-llm
cargo test -p web_service
```

#### 任务 6.3: 验证 masking 功能
创建测试验证装饰器工作正常

## 预期结果

### 代码行数减少
- 删除 `client/mod.rs`: ~333 行
- 删除 `client/decorator.rs`: ~308 行
- 删除 `client/models_handler.rs`: ~100 行
- 删除 `client_trait.rs`: ~29 行
- 删除 `masking.rs`: ~27 行
- 删除 `openai.rs`: ~3 行
- **总计减少**: ~800 行

### 新增代码
- `masking_decorator.rs`: ~60 行
- `provider_factory.rs` 更新: ~30 行
- **总计新增**: ~90 行

### 净效果
- **代码减少**: ~710 行
- **架构更清晰**
- **功能更完善**（所有 provider 都有 masking）

## 文件结构对比

### 重构前
```
agent-llm/src/
├── auth/              # ❌ 位置不当
├── client/            # ❌ 旧系统
├── client_trait.rs    # ❌ 废弃
├── masking.rs         # ❌ 包装函数
├── openai.rs          # ❌ 只有 re-export
└── providers/
    └── copilot/
        └── mod.rs     # auth 在外部
```

### 重构后
```
agent-llm/src/
├── providers/
│   ├── common/
│   │   ├── masking_decorator.rs  # ✅ 新增
│   │   ├── stream_tool_accumulator.rs  # ✅ 移动
│   │   ├── openai_compat.rs
│   │   └── sse.rs
│   └── copilot/
       ├── auth/       # ✅ 移动到内部
       │   ├── mod.rs
       │   ├── handler.rs
       │   ├── token.rs
       │   ├── device_code.rs
       │   └── cache.rs
       └── mod.rs
└── lib.rs            # ✅ 更简洁的导出
```

## 风险评估

| 风险 | 级别 | 缓解措施 |
|------|------|---------|
| 编译错误 | 低 | 逐步执行，每步验证 |
| 测试失败 | 低 | 更新测试到新架构 |
| 外部依赖 | 低 | 检查其他 crate 使用 |
| Masking 功能缺失 | 无 | 已通过装饰器实现 |

## 执行顺序

1. ✅ Phase 1: 添加 Masking 装饰器（先添加新功能）
2. ✅ Phase 2: 删除冗余文件（清理）
3. ✅ Phase 3: 移动 Auth（重组）
4. ✅ Phase 4: 清理导出（简化）
5. ✅ Phase 5: 更新测试（修复）
6. ✅ Phase 6: 验证（确认）

## 成功标准

- [ ] 所有代码编译通过
- [ ] 所有测试通过
- [ ] Masking 功能对所有 provider 生效
- [ ] 代码行数减少 ~700 行
- [ ] 架构更清晰易懂
