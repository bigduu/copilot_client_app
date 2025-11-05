# Message Display - 消息显示优化

## ADDED Requirements

### Requirement: Tool and Workflow Result Card Components

系统 SHALL 提供两个独立的组件,分别用于展示 Tool(AI 调用)和 Workflow(用户调用)的执行结果。

**背景**:

- **Tools**: 只能由 AI 自主调用,用户无法手动触发
- **Workflows**: 用户通过 `/workflowName 参数` 手动调用
- 两者的展示需求和交互方式有所不同,需要分离组件

#### Scenario: Tool 结果的展示

- **WHEN** 消息类型为 `tool_result`
- **THEN** 系统使用 `ToolResultCard` 组件渲染
- **AND** 显示"AI Tool"标签和机器人图标(🤖)
- **AND** 显示 Tool 名称
- **AND** 不提供重试按钮(由 AI 决定是否重新调用)
- **AND** 强调这是 AI 自主决策的结果

#### Scenario: Workflow 结果的展示

- **WHEN** 消息类型为 `workflow_result`
- **THEN** 系统使用 `WorkflowResultCard` 组件渲染
- **AND** 显示"User Workflow"标签和齿轮图标(⚙️)
- **AND** 显示 Workflow 名称和用户输入的参数
- **AND** 提供重试按钮,允许用户重新执行
- **AND** 强调这是用户主动触发的操作

#### Scenario: JSON 结果的格式化(共同功能)

- **WHEN** Tool 或 Workflow 结果是有效的 JSON 字符串
- **THEN** 系统解析 JSON 并使用 JSON viewer 展示
- **AND** 支持树形结构的折叠/展开
- **AND** 应用语法高亮,key 和 value 使用不同颜色
- **AND** 两个组件使用相同的格式化逻辑

#### Scenario: 纯文本结果(共同功能)

- **WHEN** 执行结果不是 JSON(纯文本、HTML 等)
- **THEN** 系统在代码块中显示原始文本
- **AND** 保留换行符和空格
- **AND** 应用等宽字体,便于阅读

#### Scenario: 错误结果的展示

- **WHEN** Tool 或 Workflow 执行失败并返回错误信息
- **THEN** 使用红色边框和错误图标(✗)
- **AND** 显示错误消息和堆栈跟踪(如果有)
- **AND** `WorkflowResultCard` 显示"重试"按钮
- **AND** `ToolResultCard` 不显示重试按钮

#### Scenario: 组件样式差异

- **WHEN** 并排展示 Tool 和 Workflow 结果
- **THEN** 两者在视觉上有明显区分
- **AND** Tool 结果使用偏冷色调(如蓝色系)
- **AND** Workflow 结果使用偏暖色调(如绿色系)
- **AND** 图标和标签清晰标识执行来源

### Requirement: Collapsible Large Content

系统 SHALL 支持大型内容的折叠和展开,避免界面过长。

#### Scenario: 默认折叠大型结果

- **WHEN** Tool 结果超过 50 行或 5000 字符
- **THEN** 默认只显示前 20 行
- **AND** 显示"展开全部"按钮
- **AND** 在折叠状态显示总行数提示

#### Scenario: 展开和折叠操作

- **WHEN** 用户点击"展开全部"
- **THEN** 显示完整的结果内容
- **AND** 按钮文本变为"折叠"
- **AND** 用户可以再次点击折叠

#### Scenario: 逐级展开

- **WHEN** 内容是嵌套的 JSON 对象
- **THEN** 用户可以点击展开/折叠单个节点
- **AND** 不影响其他节点的状态
- **AND** 展开状态在消息重新渲染后保持

### Requirement: Copy Execution Result Functionality

系统 SHALL 提供复制 Tool/Workflow 执行结果的功能。

#### Scenario: 复制原始内容

- **WHEN** 用户点击"复制"按钮
- **THEN** 执行结果的原始文本被复制到剪贴板
- **AND** 显示成功提示:"已复制到剪贴板"
- **AND** 提示 2 秒后自动消失

#### Scenario: 复制格式化的 JSON

- **WHEN** 执行结果是 JSON 且用户点击"复制(格式化)"
- **THEN** 格式化后的 JSON(带缩进)被复制
- **AND** 便于粘贴到其他工具或编辑器

### Requirement: Message Timestamp Display

系统 SHALL 在消息中显示时间戳,帮助用户了解对话时序。

#### Scenario: 时间戳的展示位置

- **WHEN** 渲染消息卡片
- **THEN** 在消息卡片的底部或右上角显示时间戳
- **AND** 使用相对时间格式(如"2 分钟前","昨天 14:30")
- **AND** hover 时显示绝对时间(完整的日期和时间)

#### Scenario: 分组显示时间

- **WHEN** 多条消息在短时间内连续发送(< 5 分钟)
- **THEN** 只在第一条消息显示时间戳
- **AND** 减少视觉干扰,保持界面整洁

### Requirement: Message Type Visual Distinction

系统 SHALL 通过视觉样式区分不同类型的消息。

#### Scenario: 用户消息样式

- **WHEN** 渲染用户消息
- **THEN** 使用主题色背景(如蓝色)
- **AND** 文本颜色为白色
- **AND** 对齐到右侧(或保持当前设计)

#### Scenario: 助手消息样式

- **WHEN** 渲染助手消息(普通文本)
- **THEN** 使用中性背景色(如浅灰)
- **AND** 文本颜色为深色,便于阅读

#### Scenario: 系统消息样式

- **WHEN** 渲染系统消息(如错误提示、状态更新)
- **THEN** 使用警告色背景(如黄色或橙色)
- **AND** 添加相应图标(⚠ 或 ℹ)
- **AND** 字体稍小,区别于对话消息

#### Scenario: Plan 和 Question 消息样式

- **WHEN** 渲染 Plan 或 Question 类型的消息
- **THEN** 使用特定的边框和图标(🎯 或 ❓)
- **AND** 背景色略有不同,但不过于突出
- **AND** 保持与整体设计风格一致
