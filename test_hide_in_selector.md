# Hide in Selector Feature Implementation

## 功能概述

我已经成功实现了 `hide_in_selector` 功能，允许某些工具只能被 AI 主动调用，而不会出现在用户的工具选择器中。

## 实现的修改

### 1. Tool Trait 扩展
- 在 `src-tauri/src/extension_system/types/tool.rs` 中添加了 `hide_in_selector()` 方法
- 默认返回 `false`，表示工具默认在选择器中可见

### 2. ToolConfig 结构体更新
- 在 `ToolConfig` 中添加了 `hide_in_selector: bool` 字段
- 更新了相关的构建逻辑

### 3. 前端接口更新
- 更新了 Rust 的 `ToolUIInfo` 结构体
- 更新了 TypeScript 的 `ToolUIInfo` 接口
- 更新了 ToolSelector 组件的接口定义

### 4. 过滤逻辑实现
- 修改了 `get_tools_for_ui` 命令，过滤掉 `hide_in_selector` 为 `true` 的工具
- 在严格模式和非严格模式下都会应用此过滤

### 5. 示例实现
- 在 `BitbucketTool` 中实现了 `hide_in_selector() -> true`
- 在 `ConfluenceTool` 中实现了 `hide_in_selector() -> true`

## 功能特性

1. **AI 可调用**：隐藏的工具仍然可以被 AI 在非严格模式下主动调用
2. **用户不可见**：隐藏的工具不会出现在 ToolSelector 组件的列表中
3. **向后兼容**：默认所有工具都是可见的（`hide_in_selector` 默认为 `false`）
4. **灵活配置**：每个工具可以独立决定是否隐藏

## 使用方法

要让一个工具隐藏在选择器中，只需在工具实现中重写 `hide_in_selector` 方法：

```rust
fn hide_in_selector(&self) -> bool {
    true // 隐藏此工具
}
```

## 测试建议

1. 启动应用程序
2. 打开工具选择器（输入 `/` 触发）
3. 验证 `bitbucket` 和 `confluence` 工具不在列表中
4. 通过 AI 对话验证这些工具仍然可以被调用

## 注意事项

- 隐藏的工具仍然会在工具文档和其他 API 中出现
- 只有在用户主动选择工具时才会被过滤
- AI 仍然可以在适当的上下文中调用这些工具
