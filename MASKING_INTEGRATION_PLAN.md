# Masking 功能集成方案

## 问题

迁移到新的 Provider 架构时，**丢失了 keyword masking 功能**。

### 旧系统 (client/mod.rs)
```rust
pub struct CopilotClient {
    keyword_masking_config: KeywordMaskingConfig,  // ✅ 有配置
}

impl CopilotClient {
    async fn send_chat_completion_request(&self, mut request: ChatCompletionRequest) {
        self.apply_keyword_masking_to_request(&mut request);  // ✅ 自动应用
        // ... 发送请求
    }
}
```

### 新系统 (providers/copilot/mod.rs)
```rust
pub struct CopilotProvider {
    client: Client,
    token: Option<String>,
    // ❌ 没有 keyword_masking_config！
}

impl LLMProvider for CopilotProvider {
    async fn chat_stream(&self, messages: &[Message], ...) {
        // ❌ 直接使用 messages，没有 masking！
    }
}
```

## 解决方案对比

### 方案 A: 在 Provider Factory 层实现 ⭐ 推荐

```rust
// provider_factory.rs
pub async fn create_provider(config: &Config) -> Result<Arc<dyn LLMProvider>, LLMError> {
    // 加载 masking 配置
    let masking_config = load_masking_config();

    let provider = match config.provider.as_str() {
        "copilot" => {
            let mut p = CopilotProvider::new();
            p.authenticate().await?;
            p.set_masking_config(masking_config);  // 设置 masking
            Arc::new(p)
        }
        "openai" => {
            let mut p = OpenAIProvider::new(&openai_config.api_key);
            p.set_masking_config(masking_config);  // 设置 masking
            Arc::new(p)
        }
        // ... 其他 providers
    };
    Ok(provider)
}
```

**优点：**
- 统一配置管理
- 所有 provider 自动获得 masking
- 配置更新时需要重新创建 provider

**缺点：**
- Provider 结构需要添加字段
- 无法动态更新 masking 配置

### 方案 B: 在 LLMProvider Trait 层实现 ⭐⭐ 最佳

```rust
// provider.rs
#[async_trait]
pub trait LLMProvider: Send + Sync {
    async fn chat_stream(
        &self,
        messages: &[Message],
        tools: &[ToolSchema],
        max_output_tokens: Option<u32>,
    ) -> Result<LLMStream>;

    /// 默认实现：应用 masking 后调用 chat_stream
    async fn chat_stream_with_masking(
        &self,
        messages: &[Message],
        tools: &[ToolSchema],
        max_output_tokens: Option<u32>,
        masking_config: &KeywordMaskingConfig,
    ) -> Result<LLMStream> {
        // 1. 应用 masking
        let masked_messages = messages.iter().map(|m| {
            let mut masked = m.clone();
            masked.content = masking_config.apply_masking(&m.content);
            masked
        }).collect::<Vec<_>>();

        // 2. 调用原始方法
        self.chat_stream(&masked_messages, tools, max_output_tokens).await
    }
}
```

**优点：**
- 不修改 Provider 结构
- 灵活性高，可以动态切换 masking
- 向后兼容（默认实现）

**缺点：**
- 需要在调用时传递 masking_config
- 调用方需要知道 masking 配置

### 方案 C: 装饰器模式 ⭐⭐⭐ 最优雅

```rust
// providers/common/masking_decorator.rs
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
        // 1. 应用 masking
        let masked_messages = messages.iter().map(|m| {
            let mut masked = m.clone();
            masked.content = self.masking_config.apply_masking(&m.content);
            masked
        }).collect::<Vec<_>>();

        // 2. 调用内部 provider
        self.inner.chat_stream(&masked_messages, tools, max_output_tokens).await
    }

    async fn list_models(&self) -> Result<Vec<String>> {
        self.inner.list_models().await
    }
}
```

**使用：**
```rust
// provider_factory.rs
pub async fn create_provider(config: &Config) -> Result<Arc<dyn LLMProvider>, LLMError> {
    let masking_config = load_masking_config();

    let base_provider = match config.provider.as_str() {
        "copilot" => CopilotProvider::new(),
        "openai" => OpenAIProvider::new(&api_key),
        // ...
    };

    // 包装 masking decorator
    let masked_provider = MaskingProviderDecorator::new(base_provider, masking_config);

    Ok(Arc::new(masked_provider))
}
```

**优点：**
- ✅ 不修改任何现有 Provider 代码
- ✅ 所有 provider 自动获得 masking
- ✅ 可以动态添加/移除 masking
- ✅ 符合装饰器模式（类似旧的 MetricsClientDecorator）
- ✅ 配置可以动态更新（重新创建 decorator）

**缺点：**
- 多一层包装

## 推荐方案：方案 C (装饰器模式)

理由：
1. **零侵入** - 不需要修改任何现有 provider
2. **可插拔** - 可以轻松添加/移除 masking
3. **模式一致** - 与旧的 MetricsClientDecorator 一致
4. **易于维护** - 功能单一，职责清晰

## 实现步骤

### Step 1: 创建 MaskingProviderDecorator

```rust
// providers/common/masking_decorator.rs
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
        // Apply masking
        if !self.masking_config.entries.is_empty() {
            let masked_messages: Vec<Message> = messages
                .iter()
                .map(|m| {
                    let mut masked = m.clone();
                    masked.content = self.masking_config.apply_masking(&m.content);
                    masked
                })
                .collect();

            log::debug!(
                "Applied keyword masking to {} messages",
                messages.len()
            );

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

### Step 2: 在 provider_factory.rs 中使用

```rust
// provider_factory.rs
use crate::providers::common::masking_decorator::MaskingProviderDecorator;
use chat_core::keyword_masking::KeywordMaskingConfig;
use chat_core::paths::keyword_masking_json_path;

fn load_masking_config() -> KeywordMaskingConfig {
    let path = keyword_masking_json_path();
    if !path.exists() {
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

pub async fn create_provider(config: &Config) -> Result<Arc<dyn LLMProvider>, LLMError> {
    // Load masking config
    let masking_config = load_masking_config();

    // Create base provider
    let base_provider = match config.provider.as_str() {
        "copilot" => {
            let mut provider = CopilotProvider::new();
            provider.try_authenticate_silent().await.ok();
            provider
        }
        "openai" => {
            let openai_config = config.providers.openai.as_ref()?;
            OpenAIProvider::new(&openai_config.api_key)
        }
        // ... other providers
    };

    // Wrap with masking decorator
    let masked_provider = MaskingProviderDecorator::new(base_provider, masking_config);

    Ok(Arc::new(masked_provider))
}
```

### Step 3: 删除 masking.rs

```bash
# 删除无用的包装文件
rm crates/agent-llm/src/masking.rs
```

### Step 4: 更新 lib.rs

```rust
// lib.rs
// ❌ 删除这一行
pub mod masking;
pub use masking::apply_masking;
```

## 好处

1. ✅ **所有 provider 自动获得 masking 功能**
2. ✅ **不修改任何现有 provider 代码**
3. ✅ **配置集中管理**
4. ✅ **可以动态更新配置（热重载）**
5. ✅ **删除无用的 masking.rs**
6. ✅ **符合装饰器模式，代码优雅**

## 与旧系统对比

| 特性 | 旧 CopilotClient | 新 Provider (装饰器) |
|------|-----------------|---------------------|
| Masking 支持 | ✅ 内置 | ✅ 装饰器 |
| 所有 provider | ❌ 仅 Copilot | ✅ 所有 provider |
| 配置管理 | ✅ 加载配置 | ✅ 加载配置 |
| 动态更新 | ❌ 需要重启 | ✅ 热重载 |
| 代码侵入性 | ❌ 修改结构 | ✅ 零侵入 |
| 可测试性 | ⚠️ 难以测试 | ✅ 易于测试 |

要我现在实现这个装饰器方案吗？
