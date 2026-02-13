# 四层防护方案实施总结

## 已实施的更改

### ✅ Layer 1: 延迟 Store 初始化（前端）

**文件**: `src/pages/ChatPage/store/index.ts`
- 移除了第194行的自动 `initializeStore()` 调用
- 添加了 `isInitialized` 标志防止重复初始化
- 导出了 `initializeStore` 函数供外部调用

**文件**: `src/app/App.tsx`
- 导入了 `initializeStore` 函数
- 在 `isSetupComplete` 变为 true 时调用 `initializeStore()`
- 确保 Store 只在 setup 完成后初始化

**影响**:
- 防止应用启动时立即触发 `/v1/models` 请求
- 确保在 Setup 页面阶段不会发起任何 API 请求

---

### ✅ Layer 2: 条件化 Models 拉取（前端）

**文件**: `src/services/config/ConfigService.ts`
- 添加了 `SetupStatus` 接口定义
- 添加了 `getSetupStatus()` 方法，通过 Tauri 命令获取 setup 状态

**文件**: `src/pages/ChatPage/store/slices/modelSlice.ts`
- 在 `fetchModels` 函数开头检查 setup 状态
- 如果 setup 未完成，设置 fallback 模型并跳过 API 调用
- 如果检查失败，继续执行（graceful degradation）

**影响**:
- 前端层额外保护，防止不必要的 API 请求
- 为用户提供清晰的错误信息："Complete setup to access all models"

---

### ✅ Layer 3: 后端 Token 文件检查（后端） - 最高优先级

**文件**: `crates/web_service/src/controllers/openai_controller.rs`
- 在 `get_models` 函数开头检查 `.token` 和 `.copilot_token.json` 文件
- 如果两个文件都不存在，返回空模型列表，不调用 `copilot_client.get_models()`
- 添加了日志记录以便调试

**影响**:
- **关键保护层**: 即使前端有任何问题，后端也不会触发认证流程
- 防止在无 token 时打开浏览器或弹出 GUI 窗口

---

### 🔄 Layer 4: 认证静默模式（后端） - 可选

**状态**: 未实施（被 Layer 3 覆盖）

**原因**:
- Layer 3 已经在 `/v1/models` 端点中阻止了认证流程的触发
- `copilot_client.get_models()` 只有在有 token 文件时才会被调用
- 因此 `auth_handler.get_chat_token()` 不会在 setup 阶段被调用

**替代方案**:
- 如果需要额外保护，可以启用 `headless_auth` 模式
- 环境变量: `BAMBOO_HEADLESS=true`
- 配置文件: `"headless_auth": true`

---

## 测试计划

### 1. 后端单元测试

创建测试验证 token 检查逻辑：

```rust
#[tokio::test]
async fn test_get_models_returns_empty_without_token() {
    let temp_dir = tempfile::tempdir().unwrap();
    let app_state = create_test_app_state(temp_dir.path()).await;

    // 确保没有 .token 文件
    let resp = get_models(web::Data::new(app_state)).await.unwrap();
    assert_eq!(resp.status(), 200);

    let body: ListModelsResponse = test::read_body_json(resp).await;
    assert!(body.data.is_empty());
}
```

### 2. 手动集成测试

#### 测试场景 1: 全新安装流程
```bash
# 1. 删除 token 文件
rm -rf ~/.bamboo/.token ~/.bamboo/.copilot_token.json

# 2. 重置 config.json 中的 setup 标志
# (通过 Tauri 命令或直接编辑文件)

# 3. 启动应用
npm run tauri dev

# 预期结果:
# - 显示 SetupPage
# - 没有浏览器窗口弹出
# - 没有 "GitHub Device Authorization" 弹窗
# - 控制台显示: "Setup not complete, skipping model fetch"
# - 后端日志显示: "No .token or .copilot_token.json file found, returning empty model list"
```

#### 测试场景 2: Setup 完成流程
```bash
# 1. 完成 setup (通过 UI)

# 预期结果:
# - 应用切换到 MainLayout
# - Store 正确初始化
# - 模型被获取（此时可能触发认证，这是正常的）
```

#### 测试场景 3: Token 存在流程
```bash
# 1. 创建有效的 .token 文件
echo "valid-token" > ~/.bamboo/.token

# 2. 启动应用 (假设 setup 已完成)

# 预期结果:
# - 模型被正常获取
# - 没有认证弹窗（因为 token 已存在）
```

---

## 关键文件汇总

| 文件路径 | 修改内容 | 作用 |
|---------|---------|------|
| `src/pages/ChatPage/store/index.ts` | 移除自动初始化，导出函数 | Layer 1: 延迟初始化 |
| `src/app/App.tsx` | setup 完成后调用初始化 | Layer 1: 延迟初始化 |
| `src/services/config/ConfigService.ts` | 添加 `getSetupStatus()` 方法 | Layer 2: 状态检查支持 |
| `src/pages/ChatPage/store/slices/modelSlice.ts` | setup 状态检查 | Layer 2: 条件化拉取 |
| `crates/web_service/src/controllers/openai_controller.rs` | token 文件检查 | Layer 3: 后端保护 |

---

## 预期结果

实施这三层防护后：

1. **Setup 未完成时**:
   - ✅ 用户看到 SetupPage
   - ✅ 没有认证弹窗
   - ✅ 后端返回空模型列表（日志可见）
   - ✅ 前端显示 fallback 模型

2. **Setup 完成时**:
   - ✅ Store 正常初始化
   - ✅ 模型正常获取
   - ✅ 如有需要会触发认证（预期行为）

3. **多层保护**:
   - ✅ Layer 3（后端）是最后一道防线
   - ✅ Layer 1 和 Layer 2 提供前端优化

4. **用户体验**:
   - ✅ 用户在配置 proxy 之前不会被打断
   - ✅ 配置完成后正常使用

---

## 验证步骤

### 快速验证

```bash
# 1. 检查编译
npm run build        # TypeScript
cargo check -p web_service  # Rust

# 2. 删除 token 文件
rm -rf ~/.bamboo/.token ~/.bamboo/.copilot_token.json

# 3. 启动应用
npm run tauri dev

# 4. 观察行为:
#    - 应该看到 SetupPage
#    - 浏览器不应该自动打开
#    - 没有 GUI 弹窗
#    - 终端日志应该显示: "No .token or .copilot_token.json file found"
```

---

## 下一步

1. **手动测试**: 按照测试计划进行完整测试
2. **日志验证**: 检查后端日志确认 Layer 3 生效
3. **UI 验证**: 确认用户看到正确的 fallback 模型信息
4. **性能测试**: 验证启动时间没有增加（Layer 2 的 `get_setup_status` 调用应该很快）

---

## 潜在问题与解决方案

### 问题 1: 组件依赖立即初始化的 store 数据

**风险**: 某些组件可能在初始化前访问 store

**缓解**:
- Zustand store 本身在首次访问时创建
- 只是异步数据加载延迟
- 组件应该处理空状态

**测试**: 验证组件在初始化前访问 store 不会崩溃

### 问题 2: 多次调用 `get_setup_status` 影响性能

**风险**: Layer 2 增加了额外的 Tauri 命令调用

**缓解**:
- 调用很轻量，只读取本地配置文件
- 可以考虑缓存 setup 状态（但当前实现足够快）

### 问题 3: 用户有有效 token 但 `.token` 文件被删除

**风险**: 异常情况下可能误判

**缓解**:
- token 文件在认证流程中自动创建
- 用户删除属于异常情况
- Layer 2 会检查 setup 状态，提供额外保护

---

## 成功标准

✅ **Layer 3 生效**: 后端日志显示 "No .token file found"
✅ **Layer 1 生效**: Store 在 setup 完成后才初始化
✅ **Layer 2 生效**: 前端日志显示 "Setup not complete, skipping model fetch"
✅ **无弹窗**: Setup 阶段没有浏览器或 GUI 弹窗
✅ **正常流程**: Setup 完成后应用正常工作
