# Provider 配置系统完整实现方案

## 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                      │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              ProviderSettings Component               │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │   │
│  │  │ Provider选择 │  │ API Key输入  │  │ 模型选择   │ │   │
│  │  │   Select     │  │  Input       │  │  Select    │ │   │
│  │  └──────────────┘  └──────────────┘  └────────────┘ │   │
│  │                        ┌──────────────┐              │   │
│  │                        │  保存按钮    │              │   │
│  │                        │  Button      │              │   │
│  │                        └──────────────┘              │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                  │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              settingsService.ts                      │   │
│  │  - saveProviderConfig(config: ProviderConfig)        │   │
│  │  - getProviderConfig(): Promise<ProviderConfig>      │   │
│  │  - reloadConfig(): Promise<void>                     │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                  │
└───────────────────────────┼──────────────────────────────────┘
                            │ HTTP API
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Backend (Rust)                          │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           settings_controller.rs                     │   │
│  │                                                      │   │
│  │  GET  /api/settings/provider                         │   │
│  │  POST /api/settings/provider                         │   │
│  │  POST /api/settings/reload                           │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                  │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Config Manager                          │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │   │
│  │  │ 读取配置文件 │  │ 保存配置文件 │  │ 热重载     │ │   │
│  │  │ read()       │  │ write()      │  │ reload()   │ │   │
│  │  └──────────────┘  └──────────────┘  └────────────┘ │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                  │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Provider Factory                        │   │
│  │  - create_provider(config) -> Arc<dyn LLMProvider>   │   │
│  │  - reload_provider()                                 │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                  │
└───────────────────────────┼──────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              ~/.bamboo/config.json                           │
├─────────────────────────────────────────────────────────────┤
│ {                                                            │
│   "provider": "gemini",                                      │
│   "providers": {                                             │
│     "gemini": {                                              │
│       "api_key": "AIza...",                                  │
│       "model": "gemini-pro"                                  │
│     },                                                       │
│     "openai": {                                              │
│       "api_key": "sk-..."                                    │
│     },                                                       │
│     "anthropic": {                                           │
│       "api_key": "sk-ant-..."                                │
│     }                                                        │
│   }                                                          │
│ }                                                            │
└─────────────────────────────────────────────────────────────┘
```

## 数据流

### 1. 启动加载配置
```
App启动 → 读取config.json → 创建Provider → 使用Provider
```

### 2. UI修改配置
```
用户修改 → UI调用API → 后端保存配置 → 返回成功 → UI显示成功
                                ↓
                         可选: 调用reload API
```

### 3. 热重载配置
```
调用reload API → 重新读取配置 → 重新创建Provider → 原子替换
```

## API 设计

### Backend API

```rust
// GET /api/settings/provider
// Response
{
  "provider": "gemini",
  "available_providers": ["copilot", "openai", "anthropic", "gemini"],
  "config": {
    "gemini": {
      "api_key": "AIza...",
      "base_url": null,
      "model": "gemini-pro"
    },
    "openai": {
      "api_key": "sk-...",
      "model": "gpt-4o-mini"
    }
  }
}

// POST /api/settings/provider
// Request
{
  "provider": "anthropic",
  "config": {
    "anthropic": {
      "api_key": "sk-ant-...",
      "model": "claude-3-5-sonnet-20241022"
    }
  }
}
// Response: 200 OK

// POST /api/settings/reload
// Response: 200 OK (配置已重新加载)
```

### Frontend API

```typescript
// services/settingsService.ts

export interface ProviderConfig {
  provider: string;
  providers: {
    openai?: OpenAIConfig;
    anthropic?: AnthropicConfig;
    gemini?: GeminiConfig;
    copilot?: CopilotConfig;
  };
}

export interface OpenAIConfig {
  api_key: string;
  base_url?: string;
  model?: string;
}

export const settingsService = {
  // 获取当前配置
  getProviderConfig: async (): Promise<ProviderConfig> => {
    const response = await fetch('/api/settings/provider');
    return response.json();
  },

  // 保存配置
  saveProviderConfig: async (config: ProviderConfig): Promise<void> => {
    await fetch('/api/settings/provider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
  },

  // 重新加载配置
  reloadConfig: async (): Promise<void> => {
    await fetch('/api/settings/reload', { method: 'POST' });
  },
};
```

## 实现步骤

### Phase 1: Backend (Rust)

1. **扩展 Config 结构** (`chat_core/src/config.rs`)
   - 添加 `provider: String`
   - 添加 `providers: ProviderConfigs`
   - 支持序列化/反序列化

2. **创建 Provider Factory** (`agent-llm/src/provider_factory.rs`)
   - 根据配置创建对应的 Provider
   - 支持热重载

3. **实现 Settings Controller** (`web_service/src/controllers/settings_controller.rs`)
   - GET /api/settings/provider
   - POST /api/settings/provider
   - POST /api/settings/reload

4. **更新 AppState** (`web_service/src/server.rs`)
   - 使用 Arc<RwLock<>> 存储 Provider
   - 支持原子替换

### Phase 2: Frontend (React)

1. **创建 Settings Service** (`src/services/settingsService.ts`)
   - API 调用封装
   - 类型定义

2. **创建 ProviderSettings Component** (`src/pages/SettingsPage/components/ProviderSettings/`)
   - Provider 选择下拉框
   - API Key 输入（密码隐藏）
   - 模型选择
   - Base URL 配置（高级选项）
   - 保存按钮

3. **更新 Settings Page** (`src/pages/SettingsPage/`)
   - 添加 ProviderSettings 组件
   - 集成到现有设置页面

### Phase 3: 热重载支持

1. **Backend**
   - 实现配置热重载 API
   - 原子替换 Provider

2. **Frontend**
   - 添加"应用配置"按钮
   - 调用 reload API
   - 显示成功/失败提示

## 配置文件示例

### 完整配置

```json
{
  "provider": "anthropic",
  "providers": {
    "copilot": {
      "enabled": true
    },
    "openai": {
      "api_key": "sk-proj-xxxxx",
      "base_url": "https://api.openai.com/v1",
      "model": "gpt-4o-mini"
    },
    "anthropic": {
      "api_key": "sk-ant-xxxxx",
      "base_url": "https://api.anthropic.com",
      "model": "claude-3-5-sonnet-20241022",
      "max_tokens": 4096
    },
    "gemini": {
      "api_key": "AIza-xxxxx",
      "base_url": "https://generativelanguage.googleapis.com/v1beta",
      "model": "gemini-pro"
    }
  }
}
```

### 最小配置

```json
{
  "provider": "gemini",
  "providers": {
    "gemini": {
      "api_key": "AIza-xxxxx"
    }
  }
}
```

## 安全措施

1. **API Key 加密存储** (可选)
   - 使用系统 keychain
   - 或者简单的 base64 编码（基础保护）

2. **日志脱敏**
   - 不在日志中打印 API key
   - 只显示前4位和后4位

3. **前端显示**
   - API key 输入使用密码框
   - 只显示掩码："sk-xx...xxxx"

## 错误处理

### Backend

```rust
pub enum ConfigError {
    InvalidProvider(String),
    MissingApiKey { provider: String },
    InvalidApiKey { provider: String, reason: String },
    ConfigFileNotFound,
    ConfigParseError(String),
}
```

### Frontend

```typescript
// 显示友好的错误消息
if (error.code === 'MISSING_API_KEY') {
  message.error(`请输入 ${error.provider} 的 API Key`);
} else if (error.code === 'INVALID_API_KEY') {
  message.error('API Key 无效，请检查');
}
```

## 向后兼容

1. **默认 Provider**: copilot（保持现有行为）
2. **旧配置格式**: 自动迁移
3. **无配置**: 使用 Copilot 并提示用户配置

## 实现顺序

1. **Backend Core** (30 min)
   - Config 结构扩展
   - Provider Factory

2. **Backend API** (30 min)
   - Settings Controller
   - AppState 更新

3. **Frontend Core** (30 min)
   - Settings Service
   - 类型定义

4. **Frontend UI** (45 min)
   - ProviderSettings 组件
   - 集成到 Settings Page

5. **热重载** (15 min)
   - Backend reload API
   - Frontend reload button

**总计**: 约 2.5 小时

## 验收标准

- [ ] 可以通过配置文件切换 provider
- [ ] 可以通过 UI 修改配置
- [ ] 配置保存后立即生效（或点击应用后）
- [ ] 所有 provider 都支持配置
- [ ] API key 安全存储
- [ ] 向后兼容
- [ ] 有完善的错误处理
