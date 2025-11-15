# 废弃 API 清单 (Deprecation List)

本文档记录所有已废弃的 API 端点和功能，以及推荐的替代方案。

---

## 🚨 Phase 2.0 Pipeline 架构废弃

### ❌ `SystemPromptEnhancer` Service (已废弃)

**废弃版本**: v0.2.0  
**计划移除**: v0.3.0

**位置**: `crates/web_service/src/services/system_prompt_enhancer.rs`

**问题**:
- 职责与新的 Pipeline 架构重复
- 难以测试和扩展
- 与 `ToolEnhancementProcessor` 和 `SystemPromptProcessor` 功能重叠
- 缓存逻辑应该在 Pipeline 层面统一处理

**替代方案**:
```rust
✅ 使用: context_manager::pipeline 处理器

// 工具定义注入
ToolEnhancementProcessor

// System Prompt 组装
SystemPromptProcessor

// 未来功能 (TODO Phase 2.x):
MermaidProcessor        // Mermaid 图表支持
TemplateProcessor       // 模板变量替换
```

**迁移示例**:

旧代码 (已废弃):
```rust
// 使用 SystemPromptEnhancer
let enhancer = SystemPromptEnhancer::with_default_config(tool_registry);
let enhanced = enhancer.enhance_prompt(base_prompt, &AgentRole::Actor).await?;
```

新代码 (推荐):
```rust
// 使用 Pipeline 处理器
use context_manager::pipeline::*;
use context_manager::pipeline::processors::*;

let pipeline = MessagePipeline::new()
    .register(Box::new(ValidationProcessor::new()))
    .register(Box::new(FileReferenceProcessor::new(workspace_root)))
    .register(Box::new(ToolEnhancementProcessor::new()))
    .register(Box::new(SystemPromptProcessor::with_base_prompt(base_prompt)));

let output = pipeline.execute(message).await?;
```

**好处**:
- ✅ 模块化：每个处理器单一职责
- ✅ 可测试：独立测试每个处理器
- ✅ 可扩展：轻松添加新处理器
- ✅ 一致性：所有消息处理统一流程

**保留功能** (待迁移到新 Processor):
- Mermaid 图表支持 → `MermaidProcessor` (TODO)
- 模板变量替换 → `TemplateProcessor` (TODO)
- 缓存机制 → Pipeline 配置 (TODO)

---

## Web Service API 端点

### 1. Context Management - Old CRUD Endpoint

#### ❌ `POST /contexts/{id}/messages` (已废弃)

**废弃版本**: v0.2.0  
**计划移除**: v0.3.0

**问题**:
- 不触发 FSM（有限状态机）
- 不会生成 AI 响应
- 不支持工具调用流程
- 仅作为直接消息操作的 CRUD 端点

**替代方案**:
```
✅ 使用: POST /contexts/{id}/actions/send_message
```

**迁移示例**:

旧代码:
```typescript
// ❌ 废弃方式
await fetch(`/contexts/${contextId}/messages`, {
  method: 'POST',
  body: JSON.stringify({
    role: 'user',
    content: 'Hello',
    branch: 'main'
  })
});
// 不会触发 AI 响应！
```

新代码:
```typescript
// ✅ 推荐方式
await fetch(`/contexts/${contextId}/actions/send_message`, {
  method: 'POST',
  body: JSON.stringify({
    message: {
      type: 'text',
      text: 'Hello'
    }
  })
});
// 会触发完整的 FSM 流程，包括 AI 响应和工具调用
```

---

### 2. Tool Controller - 所有端点 (已废弃)

**废弃版本**: v0.2.0  
**计划移除**: v0.3.0

工具系统已重构为 LLM 驱动模式。用户触发的操作应使用 Workflow 系统。

#### ❌ `POST /tools/execute` (已废弃)

**问题**: 直接工具执行绕过了 LLM 决策流程

**替代方案**:
```
✅ 使用: Workflow 系统
   - POST /v1/workflows/execute
   - 或通过 LLM agent 自动调用工具
```

#### ❌ `GET /tools/categories` (已废弃)

**问题**: 工具分类已迁移到 Workflow

**替代方案**:
```
✅ 使用: GET /v1/workflows/categories
```

#### ❌ `GET /tools/category/{id}/info` (已废弃)

**问题**: 工具分类信息已迁移到 Workflow

**替代方案**:
```
✅ 使用: Workflow 分类信息端点
```

---

## 迁移时间表

| 版本 | 行动 | 时间线 |
|------|------|--------|
| v0.2.0 (当前) | 标记废弃，添加警告日志 | ✅ 已完成 |
| v0.2.1 | 添加迁移指南和示例 | 📅 计划中 |
| v0.2.5 | 在响应中添加 `X-Deprecated` 头 | ✅ 已完成 |
| v0.3.0 | **完全移除**废弃端点 | 🔜 计划中 |

---

## 检查代码中的废弃使用

### Rust 后端

编译时会显示废弃警告：

```bash
cargo build
# warning: use of deprecated function `add_context_message`: ...
```

### 前端

搜索废弃端点的使用：

```bash
# 查找旧的 messages 端点
grep -r "POST.*contexts.*messages" frontend/

# 查找旧的 tool 端点
grep -r "tools/execute" frontend/
grep -r "tools/categories" frontend/
```

---

## 废弃策略

我们遵循以下废弃策略：

1. **标记阶段** (当前版本)
   - 添加 Rust `#[deprecated]` 属性
   - 添加详细的文档说明
   - 运行时日志警告
   - 响应头添加 `X-Deprecated: true`

2. **通知阶段** (下一个小版本)
   - 更新 API 文档
   - 提供迁移指南
   - 在 CHANGELOG 中突出显示

3. **移除阶段** (下一个主版本)
   - 完全移除废弃代码
   - 更新测试
   - 更新文档

---

## 新架构优势

### Signal-Pull 架构 (v0.2.0+)

新的 Context API 采用 Signal-Pull 架构：

**优势**:
- ✅ SSE 信令轻量级 (<1KB)
- ✅ REST API 按需拉取数据
- ✅ 自愈机制（序列号驱动）
- ✅ 单一真相来源 (SSOT)

**新端点**:
```
GET /contexts/{id}/metadata              # 轻量级元数据
GET /contexts/{id}/messages?ids=...      # 批量查询
GET /contexts/{id}/messages/{msg}/streaming-chunks  # 增量拉取
GET /contexts/{id}/events                # SSE 事件订阅
```

### FSM-Driven Architecture

新的消息发送流程完全由 FSM 驱动：

**流程**:
```
用户消息 → FSM 状态转换 → LLM 处理 → 工具调用 → 响应生成
```

**端点**:
```
POST /contexts/{id}/actions/send_message     # FSM 驱动的消息发送
POST /contexts/{id}/actions/approve_tools    # FSM 驱动的工具审批
GET  /contexts/{id}/state                    # 获取 FSM 状态
```

---

## 帮助与反馈

如果你在迁移过程中遇到问题：

1. 查看本文档的迁移示例
2. 参考 `openspec/changes/refactor-context-session-architecture/` 中的设计文档
3. 查看集成测试：`crates/web_service/tests/signal_pull_integration_tests.rs`
4. 提交 Issue 或联系开发团队

---

**最后更新**: 2025-11-08  
**维护者**: Development Team

