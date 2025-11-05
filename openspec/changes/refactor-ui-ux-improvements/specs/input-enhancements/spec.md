# Input Enhancements - 输入增强功能

## ADDED Requirements

### Requirement: Multi-Type File Drag and Drop

系统 SHALL 支持拖放多种类型的文件到输入框,不仅限于图片。

#### Scenario: 拖放文本文件

- **WHEN** 用户将文本文件(.txt, .md, .log)拖放到输入区域
- **THEN** 系统读取文件内容(如果 < 100KB)
- **AND** 在输入框上方显示文件预览(文件名、大小、内容片段)
- **AND** 发送消息时,将文件内容包含在消息中

#### Scenario: 拖放代码文件

- **WHEN** 用户将代码文件(.js, .ts, .py, .java 等)拖放到输入区域
- **THEN** 系统识别文件类型并读取内容
- **AND** 在预览中显示语法高亮的代码片段(前 20 行)
- **AND** 发送消息时,将代码作为 markdown 代码块包含

#### Scenario: 拖放不支持的文件类型

- **WHEN** 用户拖放不支持的文件类型(如 .exe, .zip)
- **THEN** 系统显示错误提示:"不支持的文件类型"
- **AND** 不添加到输入区域
- **AND** 拖放操作被取消

#### Scenario: 拖放超大文件

- **WHEN** 用户拖放超过 10MB 的文件
- **THEN** 系统显示错误提示:"文件过大,最大支持 10MB"
- **AND** 不读取文件内容
- **AND** 建议用户使用文件上传功能(如有)

#### Scenario: 同时拖放多个文件

- **WHEN** 用户同时拖放多个文件
- **THEN** 系统处理所有支持的文件
- **AND** 在预览区域显示多个文件的信息
- **AND** 发送消息时,按顺序包含所有文件内容

### Requirement: File Paste Support

系统 SHALL 支持通过粘贴(Ctrl+V / Cmd+V)添加文件。

#### Scenario: 粘贴剪贴板中的文件

- **WHEN** 用户在输入框中按下 Ctrl+V / Cmd+V
- **AND** 剪贴板中包含文件(非图片)
- **THEN** 系统处理该文件,类似于拖放
- **AND** 显示文件预览并准备发送

#### Scenario: 粘贴文本内容

- **WHEN** 用户粘贴纯文本内容
- **THEN** 系统正常插入到光标位置
- **AND** 不进行文件处理

### Requirement: Workflow Command Highlighting

系统 SHALL 在输入框中高亮显示用户手动调用的 Workflow 命令,将 Workflow 名称与参数区分显示。

**背景**: Workflow 是用户可以手动调用的功能,格式为 `/workflowName 参数`,不同于只能由 AI 调用的 Tools。

#### Scenario: 识别 Workflow 命令格式

- **WHEN** 用户在输入框中输入 `/` 后跟 Workflow 名称和可选参数
- **THEN** 系统使用正则表达式识别 `/[a-zA-Z0-9_-]+` 格式作为 Workflow 名称
- **AND** 空格后的内容被识别为参数,不进行高亮

#### Scenario: 高亮 Workflow 名称部分

- **WHEN** 输入框中存在有效的 Workflow 命令(如 `/analyze some code`)
- **THEN** 系统在 overlay 层只高亮 `/analyze` 部分
- **AND** 使用特殊背景色(如浅蓝色)和边框
- **AND** `some code` 参数部分保持普通文本样式
- **AND** 高亮区域与输入框文本位置精确对齐

#### Scenario: 多个 Workflow 命令的处理

- **WHEN** 输入框中存在多个 Workflow 命令(如 `/workflow1 args` 和 `/workflow2`)
- **THEN** 系统高亮所有识别的 Workflow 名称部分
- **AND** 每个 Workflow 独立高亮,不重叠
- **AND** 参数部分不受影响

#### Scenario: 编辑 Workflow 命令

- **WHEN** 用户在 Workflow 名称中间编辑(插入或删除字符)
- **THEN** 高亮实时更新,反映新的文本
- **AND** 如果不再匹配 Workflow 格式,取消高亮
- **AND** 用户编辑参数时,高亮不受影响
- **AND** 性能保持流畅,无明显延迟

#### Scenario: Workflow 选择器的触发

- **WHEN** 用户仅输入 `/` 而未输入 Workflow 名称
- **THEN** 弹出 WorkflowSelector 组件,显示可用的 Workflow 列表
- **AND** 用户可以从列表中选择 Workflow
- **AND** 选择后,Workflow 名称被插入到输入框并高亮

### Requirement: File Reference with @ Symbol

系统 SHALL 支持通过 `@` 符号快速引用项目中的文件。

#### Scenario: 触发文件选择器

- **WHEN** 用户在输入框中输入 `@`
- **THEN** 系统弹出文件选择器,显示在输入框上方
- **AND** 选择器包含项目中的文件列表

#### Scenario: 搜索和过滤文件

- **WHEN** 文件选择器打开且用户继续输入
- **THEN** 系统根据输入的文本过滤文件列表
- **AND** 匹配文件名或路径的文件被显示
- **AND** 不匹配的文件被隐藏

#### Scenario: 键盘导航选择文件

- **WHEN** 文件选择器打开
- **THEN** 用户可以使用方向键(↑↓)切换选中的文件
- **AND** 按 Enter 键插入选中的文件路径
- **AND** 按 Esc 键关闭选择器

#### Scenario: 插入文件引用

- **WHEN** 用户选择一个文件(通过 Enter 或鼠标点击)
- **THEN** 系统在输入框中插入文件路径,格式为 `@path/to/file.ext`
- **AND** 光标移动到文件路径之后
- **AND** 文件选择器关闭

#### Scenario: 取消文件选择

- **WHEN** 用户按 Esc 或点击选择器外部
- **THEN** 文件选择器关闭
- **AND** 输入框中的 `@` 保持原样,不插入任何内容

#### Scenario: 文件列表获取失败

- **WHEN** 系统无法获取文件列表(权限不足或 API 失败)
- **THEN** 显示错误提示:"无法加载文件列表"
- **AND** 选择器仍可关闭
- **AND** 错误被记录到控制台

### Requirement: Input Box Enhanced UX

系统 SHALL 提供更丰富的输入框交互体验。

#### Scenario: 实时字符计数

- **WHEN** 用户在输入框中输入内容
- **THEN** 系统在输入框下方显示当前字符数
- **AND** 如果接近限制(如 8000 字符),显示警告颜色

#### Scenario: 快捷键支持

- **WHEN** 用户按下 Shift+Enter
- **THEN** 系统插入换行符,而非发送消息
- **AND** 这是除了点击发送按钮外的标准输入行为

#### Scenario: 输入历史导航

- **WHEN** 用户按下向上箭头(↑)且输入框为空
- **THEN** 系统填充上一条发送的消息内容
- **AND** 用户可以继续按 ↑↓ 浏览历史消息
- **AND** 编辑后发送不影响原始历史
