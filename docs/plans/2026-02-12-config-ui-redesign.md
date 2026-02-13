# Config UI Redesign Proposal

## Current Problems

### 1. **Advanced JSON中的示例是硬编码的**
- `BAMBOO_CONFIG_DEMO` 显示的是 `"api_key": ""` 和 `"api_base": "https://api.githubcopilot.com"`
- 这些看起来像 Setup Page 的 Demo,对用户没有实际帮助
- 实际配置字段和示例不匹配

### 2. **Proxy Auth 没有用**
- 后端在 `Config::new()` 中明确忽略 proxy auth 字段(第61-62行):
  ```rust
  file_config.http_proxy_auth = None;
  file_config.https_proxy_auth = None;
  ```
- 前端可以填写和应用 Proxy Auth,但这些值不会持久化到 config.json
- 只有 runtime 使用,无法回显已经保存的凭据

### 3. **API KEY 和 API Base 字段意义不清**
- 对于 GitHub Copilot,这些值应该自动获取,不应该手动输入
- 可能是为了支持其他 OpenAI 兼容服务,但缺少说明
- 字段位置混乱,和 Proxy 配置混在一起

### 4. **Anthropic Model Mapping 不在 config.json 中**
- 通过单独的 API 管理 (`/bamboo/anthropic-model-mapping`)
- 存储位置不明确,用户无法直接查看/编辑
- 和其他配置分离,导致配置页面混乱

## Proposed Solution

### 新的配置结构

将配置分为三个清晰的卡片:

#### 1. **Network Settings** (网络设置)
```
┌─────────────────────────────────────────────┐
│ Network Settings                             │
│                                              │
│ HTTP Proxy                                   │
│ [http://proxy.example.com:8080             ]│
│                                              │
│ HTTPS Proxy                                  │
│ [http://proxy.example.com:8080             ]│
│                                              │
│ Proxy Authentication                         │
│ ┌──────────────────────────────────────────┐│
│ │ Status: ✓ Applied (or ✗ Not configured) ││
│ │                                          ││
│ │ Username                                 ││
│ │ [                                    ]  ││
│ │                                          ││
│ │ Password                                 ││
│ │ [••••••••                              ] ││
│ │                                          ││
│ │ ☐ Remember credentials                   ││
│ │                                          ││
│ │ [Clear] [Apply]                          ││
│ └──────────────────────────────────────────┘│
│                                              │
│ ℹ️ Proxy credentials are stored securely     │
│    in memory and not persisted to disk.      │
│                                              │
│               [Reload] [Save]                │
└─────────────────────────────────────────────┘
```

**改进点:**
- 明确显示 Proxy Auth 状态(已应用/未配置)
- 说明凭据只存在内存中,不持久化
- 移除 Proxy Auth Mode(后端不支持)

#### 2. **GitHub Copilot Settings** (GitHub Copilot 设置)
```
┌─────────────────────────────────────────────┐
│ GitHub Copilot Settings                      │
│                                              │
│ Model Selection                              │
│ [gpt-4 ↓                                   ]│
│                                              │
│ Headless Auth                                │
│ [OFF]                                        │
│                                              │
│ ℹ️ Authentication and API endpoints are      │
│    automatically managed by GitHub Copilot.  │
│                                              │
│ ℹ️ Enable Headless Auth to print login URL   │
│    in console instead of opening browser.    │
│                                              │
│               [Reload] [Save]                │
└─────────────────────────────────────────────┘
```

**改进点:**
- 移除 API Key 和 API Base 字段(Copilot 自动管理)
- 只保留用户需要配置的选项
- 添加清晰的说明文字

#### 3. **Model Mapping** (模型映射) - 可折叠
```
┌─────────────────────────────────────────────┐
│ Model Mapping (Advanced)              [▼]   │
└─────────────────────────────────────────────┘

展开后:
┌─────────────────────────────────────────────┐
│ Model Mapping (Advanced)              [▲]   │
│                                              │
│ Anthropic → Copilot Model Mapping           │
│                                              │
│ ℹ️ Configure which Copilot models to use     │
│    when Claude CLI requests specific models.│
│                                              │
│ Opus (matches models containing "opus")     │
│ [gpt-4 ↓                                   ]│
│                                              │
│ Sonnet (matches models containing "sonnet") │
│ [gpt-4o ↓                                  ]│
│                                              │
│ Haiku (matches models containing "haiku")   │
│ [gpt-4o-mini ↓                             ]│
│                                              │
│ ℹ️ These mappings are stored in              │
│    ~/.bamboo/anthropic_mapping.json          │
│                                              │
│ Configuration File                           │
│ ┌──────────────────────────────────────────┐│
│ │ {                                        ││
│ │   "opus": "gpt-4",                      ││
│ │   "sonnet": "gpt-4o",                   ││
│ │   "haiku": "gpt-4o-mini"                ││
│ │ }                                        ││
│ └──────────────────────────────────────────┘│
│                                              │
│               [Reload] [Save]                │
└─────────────────────────────────────────────┘
```

**改进点:**
- 将 Model Mapping 作为独立的高级配置
- 显示实际的配置文件内容(JSON)
- 明确说明存储位置
- 每个映射单独保存,不需要整体 Save

#### 4. **Backend Settings** (保持不变)
```
┌─────────────────────────────────────────────┐
│ Backend API Base URL                         │
│                                              │
│ [http://127.0.0.1:8080/v1                  ]│
│                                              │
│ ℹ️ Must include /v1 path.                    │
│                                              │
│      [Reset to Default] [Save]              │
└─────────────────────────────────────────────┘
```

### Backend Changes

#### 1. **支持 Proxy Auth 持久化**

修改 `crates/chat_core/src/config.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub http_proxy: String,
    #[serde(default)]
    pub https_proxy: String,
    // 移除 proxy_auth_mode
    pub proxy_auth: Option<ProxyAuth>,  // 保留在 config.json
    pub api_key: Option<String>,
    pub api_base: Option<String>,
    pub model: Option<String>,
    #[serde(default)]
    pub headless_auth: bool,
}

impl Config {
    pub fn new() -> Self {
        // ...
        if let Ok(mut file_config) = serde_json::from_str::<Config>(&content) {
            // 不再清空 proxy_auth
            config = file_config;
            loaded = true;
        }
        // ...
    }
}
```

**注意:** 出于安全考虑,Proxy Auth 仍然可以选择不持久化(用户可选)。

#### 2. **Anthropic Model Mapping 存储**

创建新文件 `~/.bamboo/anthropic_mapping.json`:

```json
{
  "opus": "gpt-4",
  "sonnet": "gpt-4o",
  "haiku": "gpt-4o-mini"
}
```

添加对应的 Rust 结构和 API endpoint:

```rust
// crates/chat_core/src/config.rs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnthropicModelMapping {
    pub opus: Option<String>,
    pub sonnet: Option<String>,
    pub haiku: Option<String>,
}

impl AnthropicModelMapping {
    pub fn load() -> Self {
        let path = anthropic_mapping_path();
        if path.exists() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Ok(mapping) = serde_json::from_str(&content) {
                    return mapping;
                }
            }
        }
        Self::default()
    }

    pub fn save(&self) -> Result<(), std::io::Error> {
        let path = anthropic_mapping_path();
        let content = serde_json::to_string_pretty(self)?;
        std::fs::write(path, content)
    }
}

fn anthropic_mapping_path() -> PathBuf {
    crate::paths::bamboo_dir().join("anthropic_mapping.json")
}
```

#### 3. **移除不需要的字段**

从 `Config` 和 UI 中移除:
- `proxy_auth_mode` (不再需要,直接配置凭据即可)
- 将 API Key/Base 标记为 "Advanced" 或移除(如果不是必需的)

### Frontend Changes

#### 1. **重构配置组件**

```tsx
// SystemSettingsConfigTab.tsx
<SystemSettingsConfigTab>
  <NetworkSettingsCard />
  <GitHubCopilotSettingsCard />
  <ModelMappingCard collapsible />
  <BackendSettingsCard />
</SystemSettingsConfigTab>
```

#### 2. **添加配置说明和帮助**

每个字段都应该有:
- 清晰的 Label
- Placeholder text (示例值)
- Help text (说明文字)
- Tooltips (可选的详细说明)

#### 3. **改进 Advanced JSON 编辑器**

如果保留 Advanced JSON:
- 显示当前 config.json 的完整内容
- 提供 "Format" 和 "Validate" 按钮
- 显示语法错误
- 提供字段文档链接

或者完全移除,因为所有配置都有 UI。

### Migration Path

1. **Phase 1: UI 重构**
   - 创建新的配置组件
   - 保留旧组件作为 fallback
   - 添加功能开关

2. **Phase 2: Backend 更新**
   - 实现 Proxy Auth 持久化
   - 实现 Anthropic Mapping 文件存储
   - 更新 API endpoints

3. **Phase 3: 迁移和清理**
   - 迁移现有配置
   - 移除旧组件
   - 更新文档

## Alternative Approaches

### Option A: 保留 API Key/Base 作为 Advanced 设置
- 将 API Key/Base 移到折叠的 "Advanced" 区域
- 添加说明:"通常不需要配置,除非使用自定义 Copilot 兼容服务"

### Option B: 完全移除 Proxy Auth UI
- 如果 Proxy Auth 真的不需要持久化
- 完全通过 Tauri 命令行或系统代理设置来配置
- 移除整个 Proxy Auth UI

### Option C: 使用系统 Keychain 存储 Proxy Auth
- 更安全的方式存储敏感凭据
- macOS Keychain, Windows Credential Manager, Linux Secret Service
- 需要额外的 Rust crate (`keyring`)

## Open Questions

1. **Proxy Auth 是否需要持久化?**
   - 如果需要,存在 config.json 是否安全?
   - 是否应该使用系统 Keychain?

2. **API Key/Base 是否真的需要?**
   - GitHub Copilot 会自动管理这些
   - 是否有场景需要手动覆盖?

3. **Anthropic Mapping 是否应该放在 config.json 中?**
   - 当前设计是单独文件
   - 放在 config.json 中会更统一吗?

4. **是否需要配置导入/导出功能?**
   - 方便用户备份和迁移配置
   - 可以导出整个 ~/.bamboo 目录

## Implementation Priority

**P0 (必须):**
- 重构 UI,移除混乱的配置项
- 添加清晰的说明和帮助文字
- 修复 Proxy Auth 的实际问题

**P1 (重要):**
- 实现 Anthropic Mapping 文件存储
- 改进 Advanced JSON 编辑器或移除

**P2 (可选):**
- Proxy Auth 持久化到文件或 Keychain
- 配置导入/导出功能
- 配置验证和错误提示

## Next Steps

1. 确认设计方案
2. 实现新的配置组件
3. 更新 Backend API
4. 测试和文档更新
