# 工具调用系统重构指南 v2.0

## 概述

我们已经成功将工具调用的业务逻辑从后端移动到前端，并实现了两种不同类型的工具调用处理机制，完全满足您的需求。

## 重构内容

### 后端变化

1. **简化了 `chat.rs`**：
   - 移除了 `parse_tool_call_format` 函数
   - 移除了 `handle_tool_call_request` 函数
   - 简化了 `execute_prompt` 函数，现在只处理直接的LLM请求

2. **增强了 `tools.rs`**：
   - 新增了 `execute_tool` 命令，用于直接执行工具
   - 添加了 `ToolExecutionRequest` 和 `ParameterValue` 结构体
   - 后端现在只负责提供工具实现和描述

3. **新增工具类型系统**：
   - 添加了 `ToolType` 枚举：`AIParameterParsing` 和 `RegexParameterExtraction`
   - 每个工具现在都有 `tool_type()` 方法来标识其类型
   - 支持 `parameter_regex()` 方法为正则工具定义参数提取规则

### 前端变化

1. **新增 `ToolService.ts`**：
   - 处理工具调用格式解析 (`parseToolCallFormat`)
   - 管理工具信息获取 (`getAvailableTools`, `getToolInfo`)
   - 使用AI解析工具参数 (`parseToolParameters`)
   - 执行工具 (`executeTool`)
   - 格式化工具结果 (`formatToolResult`)

2. **新增 `ToolCallProcessor.ts`**（独立处理器）：
   - 专门处理工具调用的业务逻辑
   - 支持两种工具类型的不同处理流程
   - 提供统一的工具调用接口
   - 独立于消息处理逻辑

3. **修改了 `useMessages.ts`**：
   - 集成了 `ToolCallProcessor` 而不是直接处理工具调用
   - 保持消息处理逻辑的简洁性
   - 添加了 `sendDirectLLMRequest` 函数处理普通消息

## 工具调用流程

### 两种工具类型

#### 1. AI参数解析工具 (AIParameterParsing)
适用于需要复杂参数解析的工具，如 `create_file`, `execute_command` 等。

```text
用户输入 "/create_file 创建一个测试文件"
    ↓
ToolCallProcessor 检测工具类型
    ↓
使用LLM解析参数 (文件路径、内容等)
    ↓
调用后端执行工具
    ↓
格式化并显示结果
```

#### 2. 正则参数提取工具 (RegexParameterExtraction)
适用于简单参数提取的工具，如 `search` 等。

```text
用户输入 "/search keyword"
    ↓
ToolCallProcessor 检测工具类型
    ↓
使用正则表达式直接提取参数
    ↓
调用后端执行工具
    ↓
格式化并显示结果
```

## 使用方法

### 工具调用格式

用户可以使用以下格式调用工具：

```
/create_file 创建一个名为test.txt的文件，内容是Hello World
/read_file src/main.rs
/execute_command ls -la
/delete_file test.txt
```

### 支持的工具

当前支持以下工具：

**AI参数解析工具：**

- `create_file`: 创建文件
- `read_file`: 读取文件
- `delete_file`: 删除文件
- `execute_command`: 执行命令
- `update_file`: 更新文件
- `append_file`: 追加文件内容
- `search_files`: 搜索文件

**正则参数提取工具：**

- `search`: 简单搜索 (使用: `/search keyword`)

## 优势

1. **前端拥有完整上下文**：前端可以在工具调用过程中进行更多的增强和处理
2. **更好的用户体验**：可以在前端显示更详细的处理步骤
3. **简化后端**：后端只负责工具实现，不处理业务逻辑
4. **更灵活的流程控制**：前端可以自由控制工具调用的整个流程

## 测试

要测试新的工具调用系统：

1. 启动应用：`npm run tauri dev`
2. 在聊天界面输入工具调用命令，例如：
   - `/create_file 创建一个测试文件`
   - `/read_file package.json`
   - `/execute_command pwd`

## 技术细节

### 参数解析

工具参数解析使用LLM来理解用户的自然语言描述，并将其转换为工具所需的参数格式。这个过程现在完全在前端进行，提供了更好的控制和扩展性。

### 错误处理

新系统提供了更好的错误处理：
- 工具不存在时的友好提示
- 参数解析失败时的错误信息
- 工具执行失败时的详细错误

### 性能优化

- 工具信息缓存在前端
- 减少了后端的复杂性
- 更好的流式响应处理

## 未来扩展

这个新架构为未来的扩展提供了良好的基础：
- 可以轻松添加新的工具类型
- 可以在前端添加工具调用的预处理和后处理
- 可以实现更复杂的工具链调用
- 可以添加工具调用的权限控制

## 迁移完成

✅ **后端工具调用逻辑已移除**
✅ **前端ToolService已实现**
✅ **独立ToolCallProcessor已创建**
✅ **两种工具类型系统已实现**
✅ **工具执行接口已创建**
✅ **消息处理已集成工具调用**
✅ **编译和运行测试通过**

## 🎉 重构成功完成！

您现在拥有了一个完全独立、灵活且强大的工具调用系统：

### ✨ **核心优势**
- **完全独立的处理器**：`ToolCallProcessor` 独立于消息处理逻辑
- **两种工具类型支持**：AI参数解析 + 正则参数提取
- **前端完全控制**：拥有工具调用的完整上下文和流程控制
- **易于扩展**：可以轻松添加新的工具类型和处理逻辑

### 🚀 **立即测试**
现在您可以测试两种类型的工具调用：

**AI参数解析工具：**
```
/create_file 创建一个名为test.txt的文件，内容是Hello World
/execute_command ls -la
```

**正则参数提取工具：**
```
/search package.json
/search src
```

重构已完成，您现在可以享受更灵活和强大的工具调用系统！🎊
