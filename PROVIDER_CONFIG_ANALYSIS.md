# Provider 配置系统分析

## 📊 当前现状

### 1. Provider 实现 ✅

目前实现了 4 个 LLM Provider：

| Provider | 文件位置 | 状态 |
|----------|---------|------|
| **Copilot** | `providers/copilot/` | ✅ 主要使用 |
| **OpenAI** | `providers/openai/` | ✅ 已实现 |
| **Anthropic** | `providers/anthropic/` | ✅ 已实现 |
| **Gemini** | `providers/gemini/` | ✅ 已实现 |

### 2. 当前配置机制

#### 后端配置 (`chat_core/src/config.rs`)

```rust
pub struct Config {
    pub http_proxy: String,
    pub https_proxy: String,
    pub proxy_auth: Option<ProxyAuth>,
    pub model: Option<String>,        // 只支持模型名称
    pub headless_auth: bool,
}
```

**问题**：
- ❌ 没有 provider 选择字段
- ❌ 没有 API key 配置（除了 Copilot 的 OAuth）
- ❌ 没有 provider-specific 配置

#### 前端配置

- **Model Mapping**: 仅用于 Anthropic 模型映射到 Copilot 模型
- **Settings Page**: 没有 provider 选择界面

#### 实际使用

```rust
// web_service/src/server.rs
pub struct AppState {
    pub copilot_client: Arc<dyn CopilotClientTrait>,  // 硬编码使用 Copilot
    pub app_data_dir: PathBuf,
}
```

**问题**：
- ❌ 硬编码使用 `CopilotClient`
- ❌ 没有动态选择 provider 的机制

---

## 🎯 改进方案

### 方案 A: 简单配置（推荐快速实现）

#### 1. 扩展 Config 结构

```rust
// chat_core/src/config.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    // ... 现有字段 ...

    /// Provider 选择: "copilot" | "openai" | "anthropic" | "gemini"
    #[serde(default = "default_provider")]
    pub provider: String,

    /// Provider-specific 配置
    pub providers: Option<ProviderConfigs>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfigs {
    pub openai: Option<OpenAIConfig>,
    pub anthropic: Option<AnthropicConfig>,
    pub gemini: Option<GeminiConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAIConfig {
    pub api_key: String,
    pub base_url: Option<String>,
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnthropicConfig {
    pub api_key: String,
    pub base_url: Option<String>,
    pub model: Option<String>,
    pub max_tokens: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeminiConfig {
    pub api_key: String,
    pub base_url: Option<String>,
    pub model: Option<String>,
}

fn default_provider() -> String {
    "copilot".to_string()
}
```

#### 2. 配置文件示例 (`~/.bamboo/config.json`)

```json
{
  "provider": "openai",
  "providers": {
    "openai": {
      "api_key": "sk-...",
      "model": "gpt-4o-mini"
    },
    "anthropic": {
      "api_key": "sk-ant-...",
      "model": "claude-3-5-sonnet-20241022",
      "max_tokens": 4096
    },
    "gemini": {
      "api_key": "AIza...",
      "model": "gemini-pro"
    }
  }
}
```

#### 3. Provider Factory

```rust
// agent-llm/src/provider_factory.rs (新文件)

use crate::providers::{OpenAIProvider, AnthropicProvider, GeminiProvider, CopilotProvider};
use crate::provider::LLMProvider;
use chat_core::Config;
use std::sync::Arc;

pub fn create_provider(config: &Config) -> Arc<dyn LLMProvider> {
    match config.provider.as_str() {
        "copilot" => {
            // Copilot 使用 OAuth，不需要 API key
            Arc::new(CopilotProvider::new())
        }
        "openai" => {
            let openai_config = config.providers
                .as_ref()
                .and_then(|p| p.openai.as_ref())
                .expect("OpenAI configuration required");

            let mut provider = OpenAIProvider::new(&openai_config.api_key);
            if let Some(base_url) = &openai_config.base_url {
                provider = provider.with_base_url(base_url);
            }
            if let Some(model) = &openai_config.model {
                provider = provider.with_model(model);
            }
            Arc::new(provider)
        }
        "anthropic" => {
            let anthropic_config = config.providers
                .as_ref()
                .and_then(|p| p.anthropic.as_ref())
                .expect("Anthropic configuration required");

            let mut provider = AnthropicProvider::new(&anthropic_config.api_key);
            if let Some(base_url) = &anthropic_config.base_url {
                provider = provider.with_base_url(base_url);
            }
            if let Some(model) = &anthropic_config.model {
                provider = provider.with_model(model);
            }
            if let Some(max_tokens) = anthropic_config.max_tokens {
                provider = provider.with_max_tokens(max_tokens);
            }
            Arc::new(provider)
        }
        "gemini" => {
            let gemini_config = config.providers
                .as_ref()
                .and_then(|p| p.gemini.as_ref())
                .expect("Gemini configuration required");

            let mut provider = GeminiProvider::new(&gemini_config.api_key);
            if let Some(base_url) = &gemini_config.base_url {
                provider = provider.with_base_url(base_url);
            }
            if let Some(model) = &gemini_config.model {
                provider = provider.with_model(model);
            }
            Arc::new(provider)
        }
        _ => panic!("Unknown provider: {}", config.provider),
    }
}
```

#### 4. 更新 web_service

```rust
// web_service/src/server.rs

use agent_llm::provider_factory::create_provider;

pub struct AppState {
    pub provider: Arc<dyn LLMProvider>,  // 改为通用 LLMProvider
    pub app_data_dir: PathBuf,
}

// 在初始化时
let config = Config::new();
let provider = create_provider(&config);

let state = AppState {
    provider,
    app_data_dir,
};
```

---

### 方案 B: 高级配置（支持多 provider）

#### 1. 支持环境变量

```bash
# .env 或环境变量
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# 或者
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
```

#### 2. 配置优先级

```
1. 环境变量 (最高优先级)
2. 配置文件 (~/.bamboo/config.json)
3. 默认值 (copilot)
```

#### 3. 动态切换（可选）

```rust
// API endpoint to switch provider
POST /api/settings/provider
{
  "provider": "anthropic",
  "config": {
    "api_key": "sk-ant-...",
    "model": "claude-3-5-sonnet-20241022"
  }
}
```

---

### 方案 C: 前端 UI 配置（完整方案）

#### 1. 前端设置页面

```tsx
// SettingsPage/ProviderSettings.tsx

<Form>
  <Form.Item label="Provider">
    <Select value={provider} onChange={setProvider}>
      <Option value="copilot">GitHub Copilot</Option>
      <Option value="openai">OpenAI</Option>
      <Option value="anthropic">Anthropic</Option>
      <Option value="gemini">Google Gemini</Option>
    </Select>
  </Form.Item>

  {provider === 'openai' && (
    <>
      <Form.Item label="API Key">
        <Input.Password value={openaiKey} onChange={setOpenAIKey} />
      </Form.Item>
      <Form.Item label="Model">
        <Select value={openaiModel} onChange={setOpenAIModel}>
          <Option value="gpt-4o-mini">GPT-4o Mini</Option>
          <Option value="gpt-4o">GPT-4o</Option>
          <Option value="gpt-4-turbo">GPT-4 Turbo</Option>
        </Select>
      </Form.Item>
    </>
  )}

  {/* Similar for other providers */}
</Form>
```

#### 2. 后端 API

```rust
// web_service/src/controllers/settings_controller.rs

#[derive(Deserialize)]
pub struct UpdateProviderRequest {
    pub provider: String,
    pub config: ProviderConfigRequest,
}

pub async fn update_provider(
    State(state): State<Arc<AppState>>,
    Json(req): Json<UpdateProviderRequest>,
) -> Result<Json<()>> {
    // 1. 更新配置文件
    // 2. 重新创建 provider
    // 3. 更新 AppState

    let mut config = Config::new();
    config.provider = req.provider;
    // ... 更新 provider-specific config ...

    let new_provider = create_provider(&config);
    state.update_provider(new_provider);

    Ok(Json(()))
}
```

---

## 🚀 推荐实施路径

### Phase 1: 基础配置支持（1-2 天）
- [x] 实现 4 个 provider
- [ ] 扩展 `Config` 结构（方案 A）
- [ ] 实现 `provider_factory.rs`
- [ ] 更新 `web_service` 使用 factory
- [ ] 支持配置文件

### Phase 2: 环境变量支持（0.5 天）
- [ ] 添加环境变量读取
- [ ] 实现优先级逻辑
- [ ] 添加文档

### Phase 3: 前端 UI（2-3 天）
- [ ] 创建 ProviderSettings 组件
- [ ] 实现 provider 切换 UI
- [ ] 添加 API key 输入表单
- [ ] 模型选择下拉框
- [ ] 保存到配置文件

### Phase 4: 高级功能（可选）
- [ ] 动态 provider 切换
- [ ] 多 provider 并发
- [ ] Provider 负载均衡
- [ ] 速率限制配置

---

## 📝 配置文件示例

### 完整示例

```json
{
  "provider": "anthropic",
  "model": "claude-3-5-sonnet-20241022",
  "http_proxy": "",
  "https_proxy": "",
  "headless_auth": false,
  "providers": {
    "copilot": {},
    "openai": {
      "api_key": "sk-proj-...",
      "base_url": "https://api.openai.com/v1",
      "model": "gpt-4o-mini"
    },
    "anthropic": {
      "api_key": "sk-ant-...",
      "base_url": "https://api.anthropic.com",
      "model": "claude-3-5-sonnet-20241022",
      "max_tokens": 4096
    },
    "gemini": {
      "api_key": "AIza...",
      "base_url": "https://generativelanguage.googleapis.com/v1beta",
      "model": "gemini-pro"
    }
  }
}
```

---

## ⚠️ 注意事项

### 1. API Key 安全

- 不要在日志中打印 API key
- 支持从环境变量读取
- 考虑加密存储（可选）

### 2. 向后兼容

- 默认 provider 为 `copilot`
- 如果没有配置，使用 Copilot（保持现有行为）
- 支持旧的配置格式

### 3. 错误处理

- Provider 配置缺失时的友好错误消息
- API key 无效时的提示
- 网络错误的重试逻辑

### 4. 测试

- 每个 provider 的配置加载测试
- Factory 创建测试
- 环境变量优先级测试

---

## 🔗 相关代码

- `chat_core/src/config.rs` - 配置结构
- `agent-llm/src/providers/` - Provider 实现
- `web_service/src/server.rs` - 当前使用方式
- `src/pages/SettingsPage/` - 前端设置页面

---

## 💡 建议

**立即可做**：
1. 实施方案 A（简单配置）
2. 用户通过编辑 `~/.bamboo/config.json` 切换 provider

**后续增强**：
3. 实施前端 UI（方案 C）
4. 支持环境变量（方案 B）
5. 动态切换功能

你想先实现哪个方案？我可以立即开始实现！
