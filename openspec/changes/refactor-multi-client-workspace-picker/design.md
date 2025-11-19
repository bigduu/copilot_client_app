# Design Document: Multi-Client Workspace Picker

## Context

当前系统的文件选择功能存在架构问题：前端（Tauri 客户端）直接调用 Tauri command 来打开原生文件对话框，这违背了项目的核心架构原则。

**项目架构定位：**
- **核心**: Rust 后端（web_service + context_manager）
- **客户端**: Tauri 是众多客户端之一（Web、未来可能有 CLI、移动端等）
- **原则**: 所有与操作系统的交互应由 Rust 后端统一处理，通过 HTTP API 暴露给客户端

当前的 Tauri command 方式将原生交互能力锁定在 Tauri 客户端，无法被其他客户端复用。

## Goals / Non-Goals

### Goals

- 将文件夹选择能力迁移到 Rust 后端 HTTP API
- 所有客户端（Web/Tauri/未来客户端）通过统一的 HTTP 接口调用
- 修复当前 UX 问题（弹窗不自动关闭）
- 保持良好的用户体验和错误处理

### Non-Goals

- 不改变文件选择的最终用户体验（仍然是原生对话框）
- 不重构整个 workspace 管理系统（仅聚焦在路径选择部分）
- 不支持文件选择（仅支持文件夹选择）

## Decisions

### Decision 1: 使用 HTTP API 而非 Tauri Command

**选择**: 通过 HTTP API `/v1/workspace/pick-folder` 提供文件夹选择能力

**理由**:
- 符合项目"Rust 后端为核心"的架构原则
- 所有客户端可以统一调用同一接口
- 便于未来扩展到其他客户端（CLI、移动端）
- 后端可以统一处理权限、日志、监控等横切关注点

**Alternatives considered**:
1. **保持 Tauri command**: 简单但违背架构原则，Web 客户端无法复用
2. **同时提供 HTTP API 和 Tauri command**: 维护成本高，存在两套实现
3. **使用 WebSocket**: 过度复杂，HTTP 请求-响应模式足够

### Decision 2: 使用 rfd crate 的同步 API

**选择**: 在后端使用 `rfd::FileDialog::pick_folder()` 同步 API

**理由**:
- 文件对话框是阻塞操作，用户必须选择或取消才能继续
- 同步 API 更简单，减少线程复杂度
- HTTP 请求本身是异步的，客户端会等待响应

**注意事项**:
- 需要在适当的线程上调用（某些平台要求主线程）
- 如遇到线程问题，可切换到 `AsyncFileDialog`

**Alternatives considered**:
1. **使用 AsyncFileDialog**: 更复杂，但如果遇到线程问题可作为备选
2. **使用 native-dialog**: 功能较少，rfd 更成熟

### Decision 3: 降级策略

**选择**: 当原生对话框不可用时，返回推荐路径列表

**实现**:
```rust
// 伪代码
match rfd::FileDialog::new().pick_folder() {
    Some(path) => Ok(json!({ "status": "success", "path": path })),
    None => {
        // 用户取消或对话框不可用
        Ok(json!({
            "status": "info",
            "message": "请手动输入路径或选择推荐路径",
            "common_directories": get_common_dirs()
        }))
    }
}
```

**理由**:
- Web 环境下某些浏览器可能限制原生对话框
- 提供良好的降级体验，不阻塞用户流程

## Risks / Trade-offs

### Risk 1: RFD 跨平台兼容性

**风险**: rfd 在某些平台或环境下可能无法打开原生对话框

**缓解措施**:
- 实现降级逻辑，返回推荐路径
- 在 macOS/Windows/Linux 三平台测试
- 监控错误日志，及时发现问题

### Risk 2: HTTP 调用延迟

**风险**: 相比直接 Tauri command，HTTP 调用可能增加轻微延迟

**评估**: 延迟可忽略（<50ms），文件对话框本身是秒级交互，不影响 UX

### Risk 3: 并发文件选择

**风险**: 多个客户端同时请求 pick_folder 可能导致混乱

**缓解措施**:
- 文件对话框天然是模态的，操作系统级别互斥
- 后端可添加简单的状态管理（如有必要）

### Trade-off: Breaking Change

**取舍**: 移除 Tauri command 是 breaking change

**迁移路径**:
1. Phase 1: 后端实现新 API（与旧 command 并存）
2. Phase 2: 前端迁移到新 API
3. Phase 3: 移除旧 command（确保所有客户端已迁移）

## Migration Plan

### Phase 1: Backend Implementation (Week 1)

1. 在 `workspace_controller.rs` 实现 `/v1/workspace/pick-folder` endpoint
2. 添加单元测试和集成测试
3. 部署到开发环境

### Phase 2: Frontend Migration (Week 2)

1. 更新 `WorkspacePicker` 组件，移除 Tauri plugin-dialog 依赖
2. 统一使用 HTTP API
3. 修复 UX 问题（自动关闭、loading 状态）
4. 测试 Web 和 Tauri 客户端

### Phase 3: Cleanup (Week 3)

1. 标记 `src-tauri/src/command/file_picker.rs` 为 deprecated
2. 监控一周，确保无问题
3. 移除 Tauri command 和相关依赖
4. 更新文档

### Rollback Strategy

- 如果新 API 有问题，可快速回退到旧 Tauri command
- 保持旧代码至少 1 个版本（标记为 deprecated 但不删除）

## Open Questions

1. **Q**: 是否需要支持多选文件夹？
   **A**: 当前不需要，Workspace 一次只能设置一个路径

2. **Q**: 是否需要记住上次选择的目录？
   **A**: 可以作为后续优化，当前不在 scope 内

3. **Q**: Web 客户端如何处理浏览器限制？
   **A**: 已有降级策略（推荐路径列表），用户体验可接受
