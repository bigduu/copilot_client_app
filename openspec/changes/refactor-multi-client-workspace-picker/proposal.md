# Refactor Multi-Client Workspace Picker

## Why

当前 workspace 路径选择存在两个核心问题：

1. 弹窗选择路径后不自动关闭，用户体验差（message.info 设置了 duration: 0）
2. RFD 实现方式不符合项目架构：前端直接调用 Tauri plugin，而非通过 Rust 后端统一处理

项目架构应该是：**Rust 后端（web_service + context manager）为核心，Tauri 只是客户端之一**。所有原生系统交互（文件选择、系统对话框等）应由 Rust 后端提供 HTTP API，供多个客户端（Web、Tauri、未来 CLI）统一调用。

## What Changes

- **架构调整**: 将文件夹选择能力从 Tauri command 迁移到 Rust 后端 HTTP API
- **统一接口**: 提供 `/v1/workspace/pick-folder` API，使用 `rfd` crate 处理原生对话框
- **多客户端支持**:
  - Web 客户端通过 HTTP 调用后端 API
  - Tauri 客户端同样通过 HTTP 调用后端 API（移除直接的 Tauri command 依赖）
  - 未来其他客户端（CLI、移动端）可复用同一接口
- **UX 改进**:
  - 修复弹窗不自动关闭的问题
  - 提供更好的加载状态和错误处理
  - 统一的降级体验（当原生对话框不可用时）

## Impact

### Affected Specs

- **新增**: `workspace-path-selection` - 工作区路径选择能力规范
- **可能涉及**: `backend-session-management` - 如需要会话级别的文件选择状态管理

### Affected Code

- `crates/web_service/src/controllers/workspace_controller.rs` - 实现新的 pick_folder API
- `src-tauri/src/command/file_picker.rs` - **移除或标记为 deprecated**
- `src/components/WorkspacePicker/index.tsx` - 修改为调用 HTTP API
- `src/components/WorkspacePathModal/index.tsx` - 修复自动关闭逻辑

### Breaking Changes

- **BREAKING**: Tauri command `pick_folder` 将被移除，客户端需改为 HTTP API 调用
- 依赖 Tauri plugin-dialog 的前端代码需要重构

### Migration Strategy

1. 先在后端实现新的 HTTP API（向后兼容）
2. 前端逐步迁移到新 API
3. 验证所有客户端功能正常后，移除旧的 Tauri command
4. 更新文档和示例
