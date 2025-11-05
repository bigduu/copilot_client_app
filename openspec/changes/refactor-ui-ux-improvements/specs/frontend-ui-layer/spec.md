# Frontend UI Layer - UI/UX 改进

## REMOVED Requirements

### Requirement: Backend Contexts Display

**Reason**: 与 ChatItem 显示的信息重复,增加界面复杂度
**Migration**: 用户可以通过 ChatItem 查看相同的信息,无需单独的 Backend Contexts 面板

## ADDED Requirements

### Requirement: System Prompt Enhanced Preview

系统 SHALL 在 System Prompt 选择器中提供增强的预览功能,帮助用户更好地理解和选择 Prompt。

#### Scenario: 预览 Markdown 格式的 Prompt

- **WHEN** 用户点击某个 System Prompt 的"Preview"按钮
- **THEN** 系统展开一个格式化的预览区域
- **AND** Markdown 内容被正确渲染,包括标题、列表、代码块等
- **AND** 代码块使用语法高亮显示

#### Scenario: 复制 Prompt 内容

- **WHEN** 用户在预览区域点击"复制"按钮
- **THEN** Prompt 的原始内容被复制到剪贴板
- **AND** 显示成功提示

#### Scenario: 长 Prompt 的折叠显示

- **WHEN** Prompt 内容超过 150 字符且未展开预览
- **THEN** 只显示前 150 字符加 "..." 省略号
- **AND** 用户可以点击"Preview"查看完整内容

### Requirement: Chat Title Auto-Generation

系统 SHALL 自动为新创建的 Chat 生成有意义的标题,基于对话内容。

#### Scenario: 首次消息后生成标题

- **WHEN** 用户在新 Chat 中发送第一条消息
- **THEN** 系统在后台调用 AI 生成标题
- **AND** 生成成功后,Chat 的标题自动更新
- **AND** 标题生成过程对用户透明,不阻塞交互

#### Scenario: 手动重新生成标题

- **WHEN** 用户在 ChatItem 菜单中点击"重新生成标题"
- **THEN** 系统调用 AI 重新生成标题
- **AND** 显示 loading 指示器
- **AND** 生成完成后更新标题

#### Scenario: 标题生成失败处理

- **WHEN** 标题生成 API 调用失败
- **THEN** 保留当前标题(或默认标题)
- **AND** 在控制台记录错误,不影响用户体验

### Requirement: Execution Result Formatted Display

系统 SHALL 以格式化和易读的方式展示 Tool(AI 调用)和 Workflow(用户调用)的执行结果。

**背景**: Tools 由 AI 自主调用,Workflows 由用户手动调用,两者都需要清晰的结果展示。

#### Scenario: JSON 格式的执行结果

- **WHEN** Tool 或 Workflow 返回的结果是有效的 JSON
- **THEN** 系统检测并解析 JSON
- **AND** 使用 JSON viewer 组件展示,支持折叠/展开
- **AND** 应用语法高亮,使结构清晰
- **AND** 显示执行类型标签(AI Tool / User Workflow)

#### Scenario: 大型结果的处理

- **WHEN** 执行结果超过 1000 行或 100KB
- **THEN** 默认折叠显示
- **AND** 提供"展开全部"和"折叠全部"按钮
- **AND** 性能保持流畅,不卡顿

#### Scenario: 执行状态的视觉区分

- **WHEN** 显示执行结果时
- **THEN** 根据状态(success/error/warning)使用不同颜色边框
- **AND** 显示相应的图标(✓ / ✗ / ⚠)
- **AND** 根据执行类型使用不同的标签样式
- **AND** Tool 结果使用机器人图标,Workflow 结果使用齿轮图标

#### Scenario: 复制执行结果

- **WHEN** 用户点击结果卡片的"复制"按钮
- **THEN** 结果内容被复制到剪贴板
- **AND** 显示成功提示

### Requirement: UI Component Architecture Refactoring

系统 SHALL 重构前端组件架构,提高代码质量和可维护性。

#### Scenario: 组件职责清晰划分

- **WHEN** 开发者查看组件代码
- **THEN** 每个组件有单一、明确的职责
- **AND** 组件之间的依赖关系清晰
- **AND** 通用逻辑被提取为 hooks 或 utils

#### Scenario: 状态管理优化

- **WHEN** 状态需要在多个组件间共享
- **THEN** 使用 Zustand store 管理,而非 props drilling
- **AND** 本地状态(local state)仅用于 UI 交互状态
- **AND** 状态更新逻辑集中在 store 的 actions 中

#### Scenario: 性能优化应用

- **WHEN** 组件不需要因父组件更新而重渲染
- **THEN** 使用 React.memo 包装组件
- **AND** 使用 useMemo 和 useCallback 优化计算和回调
- **AND** 长列表使用虚拟滚动(如需要)
