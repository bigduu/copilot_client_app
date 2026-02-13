# Config Cleanup Implementation Plan

## 问题总结

### 1. API Key 和 API Base 字段不需要
- **原因**: CopilotClient 通过 OAuth Device Code Flow 自动获取
- **当前状态**: 在 Config struct 中存在，前端显示
- **问题**: 用户不知道这些字段的意义，可能导致误配置

### 2. Proxy Auth 无法回显
- **原因**: `Config::new()` 中强制清空 proxy_auth (第 61-62, 72-73 行)
- **当前状态**: 前端可以设置，但无法查看已保存的凭据
- **问题**: 用户不知道 Proxy Auth 是否已配置

### 3. Anthropic Model Mapping 存储位置不清晰
- **存储位置**: `~/.bamboo/anthropic-model-mapping.json`
- **问题**: 不在 config.json 中，UI 混乱

### 4. Advanced JSON 示例是硬编码的
- **问题**: 示例来自 Setup Page Demo，对用户没有帮助

## 实施方案

### Phase 1: 后端修改

#### 1.1 修改 Config struct

**文件**: `crates/chat_core/src/config.rs`

**修改前**:
```rust
pub struct Config {
    pub http_proxy: String,
    pub https_proxy: String,
    pub http_proxy_auth: Option<ProxyAuth>,
    pub https_proxy_auth: Option<ProxyAuth>,
    pub api_key: Option<String>,
    pub api_base: Option<String>,
    pub model: Option<String>,
    pub headless_auth: bool,
}
```

**修改后**:
```rust
pub struct Config {
    // Network settings
    pub http_proxy: String,
    pub https_proxy: String,
    pub proxy_auth: Option<ProxyAuth>,  // 单一 proxy auth (http 和 https 共用)

    // GitHub Copilot settings
    pub model: Option<String>,
    pub headless_auth: bool,

    // API key 和 api_base 已移除（由 CopilotClient 自动管理）
}
```

**理由**:
- 移除 `api_key` 和 `api_base`（不需要）
- 合并 `http_proxy_auth` 和 `https_proxy_auth` 为单一 `proxy_auth`（简化配置）
- 保留 `model` 和 `headless_auth`（用户需要配置）

#### 1.2 修复 Proxy Auth 加密存储

**文件**: `crates/chat_core/src/config.rs`

**修改 Config::new()**:
```rust
impl Config {
    pub fn new() -> Self {
        let json_path = config_json_path();
        if json_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&json_path) {
                if let Ok(config) = serde_json::from_str::<Config>(&content) {
                    return config;  // 不再清空 proxy_auth
                }
            }
        }

        // Default config
        Config {
            http_proxy: String::new(),
            https_proxy: String::new(),
            proxy_auth: None,
            model: None,
            headless_auth: false,
        }
    }
}
```

**文件**: `crates/web_service/src/controllers/bamboo_controller.rs`

**修改 get_bamboo_config**:
```rust
#[get("/bamboo/config")]
pub async fn get_bamboo_config(app_state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    let path = config_path(&app_state);
    match fs::read_to_string(&path).await {
        Ok(content) => {
            let mut config = serde_json::from_str::<Value>(&content)?;

            // 解密 proxy auth 用于内部使用
            decrypt_proxy_auth(&mut config);

            // 检查 proxy auth 是否已配置（不返回实际凭据）
            let has_proxy_auth = config.get("proxy_auth_encrypted").is_some();

            // 返回配置，包含 proxy auth 状态指示器
            if let Some(obj) = config.as_object_mut() {
                obj.remove("proxy_auth");
                obj.remove("proxy_auth_encrypted");
                obj.insert("has_proxy_auth".to_string(), json!(has_proxy_auth));
            }

            Ok(HttpResponse::Ok().json(config))
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            Ok(HttpResponse::Ok().json(json!({})))
        }
        Err(err) => Err(AppError::StorageError(err)),
    }
}
```

**新增 API endpoint**:
```rust
#[get("/bamboo/proxy-auth/status")]
pub async fn get_proxy_auth_status(app_state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    let path = config_path(&app_state);

    if !path.exists() {
        return Ok(HttpResponse::Ok().json(json!({
            "configured": false,
            "username": null
        })));
    }

    let content = fs::read_to_string(&path).await?;
    let config: Value = serde_json::from_str(&content)?;

    // 检查是否有加密的 proxy auth
    if let Some(encrypted) = config.get("proxy_auth_encrypted").and_then(|v| v.as_str()) {
        // 解密获取 username（不返回 password）
        match chat_core::encryption::decrypt(encrypted) {
            Ok(decrypted) => {
                if let Ok(auth) = serde_json::from_str::<ProxyAuth>(&decrypted) {
                    return Ok(HttpResponse::Ok().json(json!({
                        "configured": true,
                        "username": auth.username
                    })));
                }
            }
            Err(e) => log::warn!("Failed to decrypt proxy auth: {}", e),
        }
    }

    Ok(HttpResponse::Ok().json(json!({
        "configured": false,
        "username": null
    })))
}
```

#### 1.3 迁移现有配置

**文件**: `crates/chat_core/src/config.rs`

添加迁移逻辑：
```rust
impl Config {
    pub fn new() -> Self {
        let json_path = config_json_path();
        if json_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&json_path) {
                // 尝试解析新格式
                if let Ok(config) = serde_json::from_str::<Config>(&content) {
                    return config;
                }

                // 尝试解析旧格式并迁移
                if let Ok(old_config) = serde_json::from_str::<OldConfig>(&content) {
                    let new_config = migrate_config(old_config);
                    // 保存新格式
                    if let Ok(new_content) = serde_json::to_string_pretty(&new_config) {
                        let _ = std::fs::write(&json_path, new_content);
                    }
                    return new_config;
                }
            }
        }

        Config::default()
    }
}

#[derive(Deserialize)]
struct OldConfig {
    http_proxy: String,
    https_proxy: String,
    http_proxy_auth: Option<ProxyAuth>,
    https_proxy_auth: Option<ProxyAuth>,
    api_key: Option<String>,
    api_base: Option<String>,
    model: Option<String>,
    headless_auth: bool,
}

fn migrate_config(old: OldConfig) -> Config {
    Config {
        http_proxy: old.http_proxy,
        https_proxy: old.https_proxy,
        // 合并两个 proxy_auth（优先使用 https）
        proxy_auth: old.https_proxy_auth.or(old.http_proxy_auth),
        model: old.model,
        headless_auth: old.headless_auth,
    }
}
```

### Phase 2: 前端修改

#### 2.1 重构配置组件结构

**文件**: `src/pages/SettingsPage/components/SystemSettingsPage/SystemSettingsConfigTab.tsx`

新的组件结构：
```tsx
<SystemSettingsConfigTab>
  <NetworkSettingsCard />
  <CopilotSettingsCard />
  <ModelMappingCard />
  <BackendSettingsCard />
</SystemSettingsConfigTab>
```

#### 2.2 NetworkSettingsCard

```tsx
<Card title="Network Settings">
  <Space direction="vertical">
    {/* HTTP Proxy */}
    <Input
      label="HTTP Proxy"
      placeholder="http://proxy.example.com:8080"
      value={http_proxy}
      onChange={...}
    />

    {/* HTTPS Proxy */}
    <Input
      label="HTTPS Proxy"
      placeholder="http://proxy.example.com:8080"
      value={https_proxy}
      onChange={...}
    />

    {/* Proxy Authentication */}
    <Card size="small" title="Proxy Authentication">
      {proxyAuthStatus.configured ? (
        <Space direction="vertical">
          <Alert
            type="success"
            message={`Configured for user: ${proxyAuthStatus.username}`}
          />
          <Button onClick={handleClearProxyAuth}>Clear Credentials</Button>
        </Space>
      ) : (
        <Space direction="vertical">
          <Input
            label="Username"
            value={proxyAuthForm.username}
            onChange={...}
          />
          <Input.Password
            label="Password"
            value={proxyAuthForm.password}
            onChange={...}
          />
          <Checkbox
            checked={proxyAuthForm.remember}
            onChange={...}
          >
            Save credentials (encrypted)
          </Checkbox>
          <Button type="primary" onClick={handleApplyProxyAuth}>
            Apply
          </Button>
        </Space>
      )}
    </Card>

    {/* Save buttons */}
    <Flex justify="flex-end">
      <Button onClick={onReload}>Reload</Button>
      <Button type="primary" onClick={onSave}>Save</Button>
    </Flex>
  </Space>
</Card>
```

#### 2.3 CopilotSettingsCard

```tsx
<Card title="GitHub Copilot Settings">
  <Space direction="vertical">
    {/* Model Selection */}
    <Select
      label="Model"
      value={model}
      onChange={onModelChange}
      options={models.map(m => ({ label: m, value: m }))}
    />

    {/* Headless Auth */}
    <Space>
      <Switch
        checked={headless_auth}
        onChange={...}
      />
      <Text>Headless Authentication</Text>
    </Space>
    <Text type="secondary">
      Print login URL in console instead of opening browser
    </Text>

    {/* Info */}
    <Alert
      type="info"
      message="Authentication and API endpoints are automatically managed by GitHub Copilot"
    />

    {/* Save buttons */}
    <Flex justify="flex-end">
      <Button onClick={onReload}>Reload</Button>
      <Button type="primary" onClick={onSave}>Save</Button>
    </Flex>
  </Space>
</Card>
```

#### 2.4 ModelMappingCard

```tsx
<Card title="Model Mapping (Advanced)">
  <Collapse>
    <Panel header="Anthropic Model Mapping" key="1">
      <Space direction="vertical">
        <Text type="secondary">
          Configure which Copilot models to use when Claude CLI requests specific models.
        </Text>

        {['opus', 'sonnet', 'haiku'].map(modelType => (
          <Select
            key={modelType}
            label={`${modelType.charAt(0).toUpperCase() + modelType.slice(1)} (contains "${modelType}")`}
            value={mappings[modelType]}
            onChange={(value) => handleMappingChange(modelType, value)}
            options={models.map(m => ({ label: m, value: m }))}
          />
        ))}

        <Divider />

        <Text type="secondary">
          Stored in: <Text code>~/.bamboo/anthropic-model-mapping.json</Text>
        </Text>
      </Space>
    </Panel>
  </Collapse>
</Card>
```

### Phase 3: 移除不需要的字段

#### 3.1 更新 Config struct 默认值

移除 `api_key` 和 `api_base` 相关代码：
- 从 Config struct 中移除字段定义
- 从环境变量读取逻辑中移除
- 从所有测试中移除

#### 3.2 更新前端

移除：
- `BAMBOO_CONFIG_DEMO` 常量
- API Key 输入框
- API Base 输入框
- Proxy Auth Mode 下拉框

## 配置文件示例

### 最终的 `~/.bamboo/config.json`

```json
{
  "http_proxy": "http://proxy.example.com:8080",
  "https_proxy": "http://proxy.example.com:8080",
  "proxy_auth_encrypted": "abc123...:def456...",
  "model": "gpt-4",
  "headless_auth": false
}
```

### `~/.bamboo/anthropic-model-mapping.json`

```json
{
  "mappings": {
    "opus": "gpt-4",
    "sonnet": "gpt-4o",
    "haiku": "gpt-4o-mini"
  }
}
```

## 实施顺序

1. **后端修改** (Phase 1)
   - 修改 Config struct
   - 添加迁移逻辑
   - 修复 Proxy Auth 加密/解密
   - 添加 `/bamboo/proxy-auth/status` API
   - 更新测试

2. **前端修改** (Phase 2)
   - 重构配置组件
   - 实现 NetworkSettingsCard
   - 实现 CopilotSettingsCard
   - 实现 ModelMappingCard
   - 移除旧代码

3. **测试和验证** (Phase 3)
   - 测试配置迁移
   - 测试 Proxy Auth 加密/解密
   - 测试 UI 交互
   - 更新文档

## 兼容性考虑

### 向后兼容

1. **配置迁移**: 自动将旧格式转换为新格式
2. **环境变量**: 如果设置了 `API_KEY` 或 `API_BASE`，记录警告日志
3. **Proxy Auth**: 合并 `http_proxy_auth` 和 `https_proxy_auth`

### 迁移警告

```rust
if old_config.api_key.is_some() || old_config.api_base.is_some() {
    log::warn!(
        "api_key and api_base are no longer used. \
         CopilotClient automatically manages authentication."
    );
}
```

## 预期效果

### 配置更清晰

- 用户不再看到不需要的 API Key/Base 字段
- Proxy Auth 状态清晰可见
- 配置分组合理，易于理解

### 减少误配置

- 移除可能导致误配置的字段
- 每个配置项都有清晰的说明

### 更好的用户体验

- Proxy Auth 状态一目了然
- 配置文件路径透明
- 帮助文字和提示完善
