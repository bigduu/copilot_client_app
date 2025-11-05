# UI/UX 改进与重构提案

## Why

当前前端 UI 存在多个用户体验问题,需要进行系统性的重构和改进:

1. **冗余信息显示**: "Backend Contexts" 面板显示的信息与 ChatItem 重复,不需要单独展示
2. **标题生成缺失**: 每次重新加载应用后,Chat 的 title 会变成默认值(如 "main"),没有自动调用 AI 生成有意义的标题
3. **System Prompt 预览不够直观**: 新建 Chat 时,System Prompt 选择器只有一个简单的列表,缺乏对 Prompt 内容的快速预览和理解
4. **Chat 记忆功能缺失**: 应用重新打开后,无法记住用户上次打开的 Chat,影响工作连续性
5. **Tool/Workflow 执行结果显示效果差**: AI 调用的 Tool 和用户手动触发的 Workflow 的执行结果,有时是 JSON 格式且包含换行符,显示效果混乱,缺乏格式化和高亮
6. **文件拖放/粘贴功能不完善**: 当前只支持图片,需要扩展为支持各种文件类型(文档、代码等)
7. **Workflow 命令高亮不完整**: 用户手动输入 `/workflowName 参数` 时,Workflow 名称应该作为一个整体高亮显示,与普通文本区分
8. **@ 文件引用功能缺失**: 用户输入 `@` 时应该弹出文件选择器,允许快速引用项目中的文件
9. **前端架构需要重构**: 状态管理、组件职责划分等方面存在改进空间

## What Changes

### 1. 移除冗余的 Backend Contexts 面板

- 从 ChatSidebar 中移除 "Backend Contexts" 部分
- 该信息已经可以通过 ChatItem 查看,无需单独展示

### 2. 实现 AI 驱动的 Chat 标题生成

- 在用户发送第一条或前几条消息后,自动调用 AI 生成有意义的标题
- 实现标题生成的后端 API 调用
- 添加标题生成的加载状态和错误处理
- 支持手动触发重新生成标题

### 3. 增强 System Prompt 选择器 UI

- 添加 Prompt 内容的实时预览(已有基础,需要优化)
- 增加预览的 Markdown 渲染和格式化
- 显示 Prompt 的元信息(创建时间、最后修改时间等)
- 优化视觉布局,使选择过程更加直观

### 4. 实现 Chat 打开记忆功能

- 在本地存储中保存用户最后打开的 Chat ID
- 应用启动时,自动恢复上次打开的 Chat
- 如果上次的 Chat 已被删除,则智能选择最近的 Chat

### 5. 优化 Tool 和 Workflow 执行结果展示

- 对 JSON 格式的执行结果进行格式化和语法高亮
- 处理结果中的换行符,使其正确显示
- 添加折叠/展开功能,处理大型结果
- 区分不同类型的执行结果(成功、错误、警告等)
- 明确标识是 Tool(AI 调用)还是 Workflow(用户调用)的结果

### 6. 扩展文件拖放和粘贴功能

- 扩展 `useDragAndDrop` 和 `usePasteHandler` hooks,支持各种文件类型
- 添加文件预览组件(支持文本、代码、PDF 等)
- 实现文件内容的提取和发送
- 添加文件大小和类型限制

### 7. 实现 Workflow 命令整体高亮

- 在输入框中识别 `/workflowName 参数` 格式
- 将 Workflow 名称部分(不包括参数)作为一个单元进行高亮显示
- 使用不同的颜色和样式区分 Workflow 命令和普通文本
- 参数部分保持普通文本样式,便于编辑

### 8. 实现 @ 文件引用功能

- 检测用户输入的 `@` 字符
- 弹出文件选择器,展示项目中的文件列表
- 支持文件名搜索和过滤
- 支持键盘导航(方向键、Enter 选择)
- 将选中的文件路径插入到输入框中

### 9. 前端架构重构

- 优化状态管理,减少不必要的状态
- 改进组件职责划分,提高代码可维护性
- 统一错误处理和加载状态管理
- 优化性能,减少不必要的渲染

## Impact

### 受影响的 Specs

- `frontend-ui-layer`: 主要的 UI 组件变更
- `chat-persistence`: Chat 记忆功能
- `input-enhancements`: 输入框增强功能
- `message-display`: 消息显示优化

### 受影响的代码

- `src/components/ChatSidebar/index.tsx`: 移除 Backend Contexts
- `src/components/SystemPromptSelector/index.tsx`: 增强预览功能
- `src/components/MessageInput/index.tsx`: 添加 @ 引用、Workflow 高亮
- `src/components/InputContainer/index.tsx`: 文件拖放增强
- `src/components/MessageCard/index.tsx`: Tool 结果显示优化
- `src/hooks/useChatManager.ts`: 标题生成逻辑
- `src/hooks/useDragAndDrop.ts`: 扩展文件类型支持
- `src/hooks/usePasteHandler.ts`: 扩展文件类型支持
- `src/store/slices/chatSessionSlice.ts`: Chat 记忆功能
- `src/utils/`: 添加新的工具函数(文件处理、格式化等)

### Breaking Changes

- **数据层面**: 可能需要清空或重建部分数据(如用户偏好设置)
- **功能层面**: 无破坏性变更,所有功能保持正常工作
- **迁移策略**: 不需要数据迁移,可以直接部署新版本

**重要**: 本次重构允许破坏现有数据,专注于功能实现,不考虑数据兼容性。
