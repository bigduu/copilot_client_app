# Processor重构计划 - 将逻辑迁移到前端

## 重构目标

将Rust后端的processor业务逻辑迁移到前端，让Rust专注于提供基础设施能力，前端负责所有业务逻辑控制。

## 架构变化

### **之前的架构**
```
用户输入 -> Rust Processor -> LLM判断 -> 工具执行 -> 返回结果
```

### **新架构**  
```
用户输入 -> 前端增强系统提示 -> LLM响应 -> 前端解析工具调用 -> 前端执行工具 -> 渲染结果
```

## 详细重构方案

### **阶段1: 新增后端API**

#### 1.1 统一的工具列表API（XML格式）
```rust
// tools.rs
#[tauri::command]
pub async fn get_all_available_tools() -> Result<String, String>
```
- 合并local tools + MCP tools
- 返回统一的XML格式
- 保持现有XML结构的优势（明显的开头，便于渲染）

#### 1.2 工具执行API
```rust
// tools.rs
#[derive(Debug, Serialize)]
pub struct ToolExecutionError {
    pub error_type: String, // "validation_error" | "execution_error" | "not_found"
    pub message: String,
    pub details: Option<String>,
}

#[tauri::command]
pub async fn execute_local_tool(
    tool_name: String,
    parameters: Vec<Parameter>,
) -> Result<String, ToolExecutionError>

#[tauri::command]
pub async fn execute_mcp_tool(
    tool_name: String,
    parameters: Vec<Parameter>,
) -> Result<String, ToolExecutionError>

#[tauri::command]
pub async fn execute_tools_batch(
    tool_calls: Vec<ToolCall>,
) -> Result<Vec<(String, Result<String, ToolExecutionError>)>, String>
```

### **阶段2: 简化后端聊天API**
```rust
// chat.rs - 移除所有processor逻辑
#[tauri::command(async)]
pub async fn execute_prompt(
    messages: Vec<Message>, // 前端已预处理
    model: Option<String>,
    state: tauri::State<'_, CopilotClient>,
    channel: tauri::ipc::Channel<String>,
) -> Result<(), String>
```
- 纯粹的LLM流式请求
- 不做任何工具相关处理

### **阶段3: 前端Processor实现**

#### 3.1 工具解析器
```typescript
// utils/toolParser.ts
export class ToolParser {
  parseXmlToolList(xmlContent: string): ToolInfo[]
  parseToolCallsFromContent(content: string): ToolCall[]
  generateSystemPrompt(tools: ToolInfo[]): string
}
```

#### 3.2 工具执行Hook
```typescript
// hooks/useToolExecution.ts
export const useToolExecution = () => {
  const loadTools = async () => {}
  const executeSingleTool = async (toolCall: ToolCall) => {}
  const executeBatchTools = async (toolCalls: ToolCall[]) => {}
}
```

#### 3.3 前端聊天流程
```typescript
// 新的前端架构
1. 加载可用工具列表
2. 用户发送消息
3. 前端增强系统提示（添加工具信息）
4. 发送LLM请求，流式渲染回复
5. LLM回复完成后，解析工具调用
6. 分类处理：安全工具自动执行，危险工具显示approval UI
7. 执行工具并渲染结果
```

### **阶段4: 清理后端**
- 移除processor目录和相关代码
- 清理lib.rs中的processor初始化
- 更新命令注册

## 关键决策

1. **工具列表格式**: XML格式（有明显开头，渲染优势）
2. **参数格式**: 统一使用Vec<Parameter>
3. **错误处理**: 定义ToolExecutionError结构
4. **批量执行**: 支持批量工具执行，前端控制工具链
5. **approval流程**: 完全由前端控制

## 优势

1. **前端完全控制**: 业务逻辑在前端，用户体验可控
2. **后端极简**: Rust只提供必要的系统能力
3. **即时渲染**: 每一步都可以立即向用户展示
4. **灵活的工具链**: 前端可以处理复杂的工具调用序列
5. **易于扩展**: 添加新功能主要在前端

## 实施顺序

1. **修改tools.rs**: 添加新的API
2. **简化chat.rs**: 移除processor相关代码  
3. **实现前端Processor**: 工具解析和系统提示生成
4. **实现前端执行逻辑**: Hook和工具执行流程
5. **移除后端processor**: 清理不需要的代码

## 预期结果

- 用户看到完整的AI思考过程
- 工具执行前可以进行确认
- 支持复杂的工具调用链
- 更好的错误处理和用户反馈
- 前端主导的交互体验
