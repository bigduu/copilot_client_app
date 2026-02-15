# Copilot 认证功能实现

## 问题背景

用户设置 Copilot 作为 provider 后，出现认证错误：
```
LLM error: Authentication error: Not authenticated. Please run authenticate() first.
```

问题原因：
1. `try_authenticate_silent()` 只尝试从缓存加载 token
2. 如果缓存不存在或过期，只记录警告但仍创建未认证的 provider
3. 后续使用时报错

## 解决方案

### 后端实现

#### 1. 创建 Copilot 认证控制器 (`copilot_auth_controller.rs`)

**新增端点：**

| 端点 | 方法 | 功能 |
|------|------|------|
| `/v1/bamboo/copilot/authenticate` | POST | 触发设备码认证流程 |
| `/v1/bamboo/copilot/auth/status` | POST | 检查认证状态 |
| `/v1/bamboo/copilot/logout` | POST | 登出并删除缓存的 token |

**认证流程：**
1. `authenticate()` - 调用 Copilot provider 的交互式认证
2. 显示设备码给用户
3. 用户在 `github.com/login/device` 输入设备码
4. 认证成功后自动重新加载 provider

**代码示例：**
```rust
#[post("/bamboo/copilot/authenticate")]
pub async fn authenticate_copilot(
    app_state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let mut provider = agent_llm::providers::CopilotProvider::new();
    provider.authenticate().await?;
    app_state.reload_provider().await?;
    Ok(HttpResponse::Ok().json(json!({"success": true})))
}
```

#### 2. 公开 Copilot auth 模块

**修改文件：** `crates/agent-llm/src/providers/copilot/mod.rs`

```rust
// 从
mod auth;

// 改为
pub mod auth;
```

允许外部代码访问 `TokenCache` 和认证相关功能。

#### 3. 改进错误提示

**修改文件：** `crates/agent-llm/src/provider_factory.rs`

```rust
match provider.try_authenticate_silent().await {
    Ok(true) => {
        log::info!("Copilot authenticated using cached token");
    }
    Ok(false) => {
        log::warn!("Copilot not authenticated. Use POST /v1/bamboo/copilot/authenticate to authenticate.");
    }
    Err(e) => {
        log::warn!("Copilot silent authentication failed: {}. Use POST /v1/bamboo/copilot/authenticate to authenticate.", e);
    }
}
```

### 前端实现

#### 1. 扩展 SettingsService

**文件：** `src/services/config/SettingsService.ts`

**新增方法：**
```typescript
export interface CopilotAuthStatus {
  authenticated: boolean;
  message?: string;
}

async getCopilotAuthStatus(): Promise<CopilotAuthStatus> {
  return apiClient.post<CopilotAuthStatus>('/bamboo/copilot/auth/status');
}

async authenticateCopilot(): Promise<void> {
  return apiClient.post<void>('/bamboo/copilot/authenticate');
}

async logoutCopilot(): Promise<void> {
  return apiClient.post<void>('/bamboo/copilot/logout');
}
```

#### 2. 更新 ProviderSettings 组件

**文件：** `src/pages/SettingsPage/components/ProviderSettings/index.tsx`

**新增状态：**
- `copilotAuthStatus` - 认证状态
- `checkingCopilotAuth` - 检查认证中
- `authenticatingCopilot` - 认证流程中

**新增功能：**

1. **自动检查认证状态**
```typescript
useEffect(() => {
  if (currentProvider === 'copilot') {
    checkCopilotAuthStatus();
  }
}, [currentProvider]);
```

2. **认证按钮**
```tsx
<Button
  type="primary"
  icon={<LoginOutlined />}
  onClick={handleCopilotAuthenticate}
  loading={authenticatingCopilot}
>
  Authenticate Copilot
</Button>
```

3. **认证状态显示**
```tsx
<Tag icon={<CheckCircleOutlined />} color="success">
  Authenticated
</Tag>
```

4. **登出按钮**
```tsx
<Button
  danger
  icon={<LogoutOutlined />}
  onClick={handleCopilotLogout}
>
  Logout from Copilot
</Button>
```

## UI 界面

### 未认证状态
```
┌─────────────────────────────────────┐
│ Authentication Status               │
│ ┌─────────────────────────────────┐ │
│ │ [✗] Not Authenticated          │ │
│ │                                 │ │
│ │ [Authenticate Copilot] [Refresh]│ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### 已认证状态
```
┌─────────────────────────────────────┐
│ Authentication Status               │
│ ┌─────────────────────────────────┐ │
│ │ [✓] Authenticated              │ │
│ │ Token expires in 120 minutes    │ │
│ │                                 │ │
│ │ [Logout from Copilot] [Refresh] │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

## 使用流程

### 1. 用户访问 Provider Settings
- 自动检查 Copilot 认证状态
- 显示当前状态（已认证/未认证）

### 2. 未认证时点击 "Authenticate Copilot"
- 显示提示："Starting Copilot authentication. Please follow the instructions in your terminal."
- 后端触发设备码流程
- 终端显示：
  ```
  🔑 Requesting device code from GitHub...
  Please visit: https://github.com/login/device
  And enter code: XXXX-XXXX
  ```
- 用户在浏览器完成认证
- 认证成功后自动重新加载 provider
- 显示成功消息："Copilot authentication successful!" + "Provider reloaded with new authentication."

### 3. 已认证时点击 "Logout from Copilot"
- 删除缓存的 token
- 刷新认证状态

## 测试

### API 测试

```bash
# 检查认证状态
curl -X POST http://127.0.0.1:8080/v1/bamboo/copilot/auth/status

# 触发认证（需要在终端交互）
curl -X POST http://127.0.0.1:8080/v1/bamboo/copilot/authenticate

# 登出
curl -X POST http://127.0.0.1:8080/v1/bamboo/copilot/logout

# 重新加载配置
curl -X POST http://127.0.0.1:8080/v1/bamboo/settings/reload
```

### 前端测试

1. 打开 Bamboo 应用
2. 进入 Settings 页面
3. 选择 "GitHub Copilot" 作为 provider
4. 查看认证状态卡片
5. 点击 "Authenticate Copilot"
6. 在终端完成设备码认证
7. 验证状态变为 "Authenticated"
8. 开始新的对话测试功能

## 修改的文件

### 后端
- `crates/web_service/src/controllers/copilot_auth_controller.rs` - **新增**
- `crates/web_service/src/controllers/mod.rs` - 导出新模块
- `crates/web_service/src/server.rs` - 注册路由
- `crates/agent-llm/src/providers/copilot/mod.rs` - 公开 auth 模块
- `crates/agent-llm/src/provider_factory.rs` - 改进错误提示

### 前端
- `src/services/config/SettingsService.ts` - 添加 Copilot 认证 API
- `src/pages/SettingsPage/components/ProviderSettings/index.tsx` - 添加认证 UI

## 编译验证

```bash
# 后端
cargo build -p web_service
✅ Finished successfully

# 前端
npm run build
✅ TypeScript 编译通过
```

## 架构改进

### 之前
```
Provider 创建
  ↓
try_authenticate_silent() 失败
  ↓
只记录警告
  ↓
未认证的 Provider 被使用
  ↓
❌ 运行时报错
```

### 现在
```
Provider 创建
  ↓
try_authenticate_silent() 失败
  ↓
记录警告 + 提示用户如何认证
  ↓
用户看到 "未认证" 状态
  ↓
点击 "Authenticate" 按钮
  ↓
✅ 完成认证，Provider 可用
```

## 关键收益

### ✅ 友好的用户体验
- 清晰的认证状态显示
- 一键触发认证流程
- 详细的错误提示

### ✅ 完整的功能
- 认证状态检查
- 设备码认证
- 登出功能
- 自动重新加载 provider

### ✅ 现代化 UI
- 使用 Ant Design 组件
- 实时状态更新
- 加载状态指示
- Tag 和图标增强可读性

---

**实现时间：** 2026-02-15
**状态：** ✅ 完成
**质量：** ⭐⭐⭐⭐⭐
