# Implementation Tasks

## 1. Backend Implementation

- [x] 1.1 在 `workspace_controller.rs` 中实现新的 `pick_folder` HTTP endpoint
  - [x] 使用 `rfd::AsyncFileDialog::pick_folder()` 打开原生文件选择对话框
  - [x] 处理跨线程调用（使用 `AsyncFileDialog`）
  - [x] 返回选中的路径或适当的错误响应
- [x] 1.2 添加错误处理
  - [x] 处理用户取消选择的情况
  - [x] 处理系统对话框不可用的情况（降级方案）
  - [x] 添加适当的日志记录
- [ ] 1.3 添加单元测试
  - [ ] 测试 API 端点的基本功能
  - [ ] 测试错误处理路径

## 2. Frontend Refactoring

- [x] 2.1 更新 `WorkspacePicker` 组件
  - [x] 移除对 `@tauri-apps/plugin-dialog` 的直接调用
  - [x] 统一使用 HTTP API `/v1/workspace/pick-folder`
  - [x] 简化 Tauri/Web 环境判断逻辑
- [x] 2.2 修复 UX 问题
  - [x] 将 `message.info` 的 `duration: 0` 改为合理值（8 秒）
  - [x] 用户选择推荐路径后立即关闭提示
- [x] 2.3 改进加载状态
  - [x] 确保所有异步路径都有 loading 状态
  - [x] 错误处理中清除 loading

## 3. Tauri Command Cleanup

- [x] 3.1 标记 `src-tauri/src/command/file_picker.rs` 中的 `pick_folder` 为 deprecated
- [x] 3.2 添加迁移说明注释
- [ ] 3.3 验证所有客户端迁移完成后，移除 Tauri command

## 4. Testing & Validation

- [ ] 4.1 Web 客户端测试
  - [ ] 验证 HTTP API 调用正常
  - [ ] 验证降级体验（推荐路径列表）
  - [ ] 验证弹窗自动关闭行为
- [ ] 4.2 Tauri 客户端测试
  - [ ] 验证原生文件对话框正常打开
  - [ ] 验证选择路径后自动填充
  - [ ] 验证错误处理
- [ ] 4.3 跨平台测试
  - [ ] macOS
  - [ ] Windows
  - [ ] Linux

## 5. Documentation

- [ ] 5.1 更新 API 文档
  - [ ] 记录新的 `/v1/workspace/pick-folder` endpoint
  - [ ] 说明请求/响应格式
- [ ] 5.2 更新迁移指南
  - [ ] 说明从 Tauri command 到 HTTP API 的迁移路径
- [ ] 5.3 更新项目 README
  - [ ] 强调 Rust 后端 + 多客户端架构
