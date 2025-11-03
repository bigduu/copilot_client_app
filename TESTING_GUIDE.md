# Testing Guide - Agent Loop & Workflow System
## 测试指南

## 概述

本测试指南涵盖了本次实现的所有新功能：
- Agent Loop 工具调用
- 工具批准机制
- 错误处理和重试
- 新的 Workflow 系统
- 弃用端点

---

## 🚀 快速冒烟测试（5分钟）

### 目的
验证系统基本功能是否正常工作。

### 步骤

#### 1. 启动应用
```bash
# 终端 1: 启动后端
cd /Users/bigduu/Workspace/TauriProjects/copilot_chat
cargo run --bin web_service

# 终端 2: 启动前端（新终端窗口）
yarn tauri dev
```

#### 2. 基本聊天测试
- [ ] 创建新聊天
- [ ] 发送简单消息："Hello"
- [ ] 验证收到响应
- [ ] 验证消息保存到后端

**预期结果**：基本聊天功能正常工作

#### 3. 编译检查
```bash
# 检查后端编译
cargo check --workspace

# 检查前端编译
yarn build
```

**预期结果**：零编译错误

---

## 🔧 Agent Loop 工具调用测试

### 测试 1: 读取文件（read_file）

**目的**：验证 LLM 可以自主调用 read_file 工具

#### 步骤
1. 创建新聊天
2. 发送消息：
   ```
   请读取 README.md 文件的前10行内容
   ```

#### 预期行为
- [ ] LLM 生成 JSON 工具调用
- [ ] 后端解析工具调用
- [ ] 执行 `read_file` 工具
- [ ] 工具结果返回给 LLM
- [ ] LLM 生成最终响应，包含文件内容摘要
- [ ] **不需要用户批准**（因为是读操作）

#### 验证点
- [ ] 在后端日志中看到工具调用：
  ```
  [ChatService] Tool call detected: read_file
  [AgentService] Executing tool: read_file
  ```
- [ ] 前端显示最终文本响应（不是工具调用JSON）
- [ ] 消息历史包含工具调用和结果

#### 故障排除
- 如果 LLM 没有调用工具 → 检查 system prompt 是否包含工具定义
- 如果工具执行失败 → 检查文件路径是否正确

---

### 测试 2: 搜索文件（search）

**目的**：验证 search 工具正常工作

#### 步骤
1. 发送消息：
   ```
   搜索项目中所有的 .rs 文件
   ```

#### 预期行为
- [ ] LLM 调用 `search` 工具
- [ ] 返回匹配的文件列表
- [ ] LLM 总结搜索结果

#### 验证点
- [ ] 搜索结果准确
- [ ] 不超过20个结果（工具限制）
- [ ] 搜索深度不超过3层（工具限制）

---

### 测试 3: 多步骤工具链

**目的**：验证 agent loop 可以连续调用多个工具

#### 步骤
1. 发送复杂任务：
   ```
   请搜索项目中的 Cargo.toml 文件，然后读取它的内容并告诉我项目名称
   ```

#### 预期行为
1. **第一步**：LLM 调用 `search` 工具查找 Cargo.toml
   - `terminate: false`（需要继续）
2. **第二步**：LLM 使用搜索结果，调用 `read_file` 读取文件
   - `terminate: false`（需要处理）
3. **第三步**：LLM 分析内容，返回最终文本响应
   - 不再调用工具

#### 验证点
- [ ] Agent loop 自动执行多个步骤
- [ ] 每个工具调用的结果正确传递到下一步
- [ ] 最终响应准确（包含项目名称）
- [ ] 用户只看到最终响应，不看到中间工具调用

#### 后端日志示例
```
[AgentService] Iteration 1: Tool call detected
[AgentService] Executing tool: search
[AgentService] Iteration 2: Tool call detected
[AgentService] Executing tool: read_file
[AgentService] Iteration 3: Text response received, stopping loop
```

---

## ✅ 工具批准测试

### 测试 4: Create File (需要批准)

**目的**：验证需要批准的工具会暂停等待用户确认

#### 步骤
1. 发送消息：
   ```
   请创建一个测试文件 test_output.txt，内容是 "Hello from agent"
   ```

#### 预期行为
1. **LLM 生成工具调用**：
   ```json
   {
     "tool": "create_file",
     "parameters": {
       "path": "test_output.txt",
       "content": "Hello from agent"
     },
     "terminate": true
   }
   ```

2. **后端暂停 agent loop**：
   - 检测到 `create_file.requires_approval == true`
   - 创建 `ApprovalRequest`
   - 返回 `ServiceResponse::AwaitingAgentApproval`

3. **前端应该显示批准模态框**：
   ⚠️ **注意**：这一步需要前端集成完成后才能测试
   - 模态框标题："Agent Tool Call Approval"
   - 工具名称：`create_file`
   - 参数显示：`path` 和 `content`

4. **用户批准**：
   - 点击 "Approve" 按钮
   - 前端调用：`POST /v1/chat/{session_id}/approve-agent`

5. **Agent loop 继续**：
   - 执行 `create_file` 工具
   - 文件被创建
   - 返回最终响应

#### 验证点
- [ ] Agent loop 在批准前暂停
- [ ] 批准请求存储在 `ApprovalManager` 中
- [ ] 批准 API 端点工作正常
- [ ] 批准后工具成功执行
- [ ] 文件实际被创建

#### 手动 API 测试（如果前端未集成）
```bash
# 1. 获取 session_id（从后端日志或数据库）
SESSION_ID="<your-session-id>"

# 2. 发送需要批准的消息后，检查批准请求
# （需要实现 GET /v1/chat/{session_id}/pending-approval 端点）

# 3. 手动批准
REQUEST_ID="<request-id-from-logs>"
curl -X POST "http://localhost:8000/v1/chat/${SESSION_ID}/approve-agent" \
  -H "Content-Type: application/json" \
  -d "{
    \"request_id\": \"${REQUEST_ID}\",
    \"approved\": true
  }"

# 4. 检查响应和文件创建
ls -la test_output.txt
cat test_output.txt
```

---

### 测试 5: 拒绝工具调用

**目的**：验证用户可以拒绝工具调用

#### 步骤
1. 发送需要批准的请求（如创建文件）
2. **拒绝**工具调用（提供原因）

#### 预期行为
- [ ] Agent loop 接收拒绝决定
- [ ] 拒绝原因返回给 LLM
- [ ] LLM 生成合适的响应（如：道歉或提供替代方案）
- [ ] 工具不被执行（文件未创建）

#### 手动 API 测试
```bash
curl -X POST "http://localhost:8000/v1/chat/${SESSION_ID}/approve-agent" \
  -H "Content-Type: application/json" \
  -d "{
    \"request_id\": \"${REQUEST_ID}\",
    \"approved\": false,
    \"reason\": \"I don't want to create this file\"
  }"
```

---

## 🔥 错误处理和重试测试

### 测试 6: 工具执行失败

**目的**：验证工具执行失败时的错误处理

#### 步骤
1. 发送会导致工具失败的请求：
   ```
   请读取一个不存在的文件：/nonexistent/file.txt
   ```

#### 预期行为
1. **工具执行失败**
2. **错误记录**：`tool_execution_failures` 递增
3. **结构化错误反馈给 LLM**：
   ```
   Error executing tool 'read_file': No such file or directory
   
   You have 2 retries remaining. 
   Please try a different approach or ask the user for help.
   ```
4. **LLM 响应**：
   - 可能尝试不同的路径
   - 或向用户说明文件不存在

#### 验证点
- [ ] 错误被捕获，不导致崩溃
- [ ] 错误消息返回给 LLM
- [ ] LLM 生成合理的响应
- [ ] Agent loop 继续（不中断）

#### 后端日志检查
```
[ChatService] Tool execution failed: read_file
[AgentService] Recording tool failure (1/3)
[ChatService] Sending error feedback to LLM
```

---

### 测试 7: 超时处理

**目的**：验证长时间运行的工具会超时

#### 准备
需要创建一个会超时的测试场景。最简单的方法是临时修改 `AgentLoopConfig`：

```rust
// 在 agent_service.rs 中临时修改
pub struct AgentLoopConfig {
    // ...
    pub tool_execution_timeout: Duration::from_secs(5), // 改为 5 秒测试
}
```

#### 步骤
1. 发送一个需要长时间执行的命令（如果命令工具已迁移到 workflow，则跳过此测试）

#### 预期行为
- [ ] 工具执行在5秒后超时
- [ ] 超时错误返回给 LLM
- [ ] Agent loop 记录超时为失败
- [ ] LLM 收到超时反馈

#### 后端日志
```
[ChatService] Tool execution timed out after 60s
[AgentService] Recording tool failure (timeout)
```

**重要**：测试后恢复配置到 60 秒

---

### 测试 8: 最大重试次数

**目的**：验证达到最大重试次数后 agent loop 停止

#### 步骤
1. 构造一个会连续失败的场景（如连续读取不存在的文件）
2. 让 LLM 多次重试

#### 预期行为
- **第1次失败**：错误反馈，2次重试剩余
- **第2次失败**：错误反馈，1次重试剩余
- **第3次失败**：错误反馈，0次重试剩余
- **停止 loop**：返回最终错误响应给用户

#### 验证点
- [ ] Agent loop 在3次失败后停止
- [ ] `should_continue()` 返回 false
- [ ] 用户收到错误说明

---

### 测试 9: 最大迭代次数

**目的**：验证 agent loop 不会无限循环

#### 步骤
1. 发送一个可能导致长循环的任务
2. 观察是否在10次迭代后停止

#### 预期行为
- [ ] Agent loop 最多执行10次迭代
- [ ] 达到限制后返回部分结果或错误
- [ ] 不会无限循环

#### 后端日志
```
[AgentService] Iteration 10 reached, stopping loop
[AgentService] Max iterations exceeded
```

---

## 🔄 Workflow 系统测试

### 测试 10: 列出可用 Workflows

#### API 测试
```bash
curl http://localhost:8000/v1/workflows/available
```

#### 预期响应
```json
{
  "workflows": [
    {
      "name": "echo",
      "description": "Echoes back the provided message",
      "category": "general",
      "requires_approval": false,
      ...
    },
    {
      "name": "create_file",
      "description": "Creates a new file with the specified content",
      "category": "file_operations",
      "requires_approval": true,
      ...
    },
    {
      "name": "execute_command",
      "description": "Executes a shell command...",
      "category": "system",
      "requires_approval": true,
      ...
    },
    {
      "name": "delete_file",
      "description": "Deletes a file from the filesystem...",
      "category": "file_operations",
      "requires_approval": true,
      ...
    }
  ]
}
```

#### 验证点
- [ ] 返回所有4个 workflows
- [ ] 每个 workflow 包含正确的元数据
- [ ] JSON 格式正确

---

### 测试 11: 执行 EchoWorkflow

**目的**：测试最简单的 workflow

#### API 测试
```bash
curl -X POST http://localhost:8000/v1/workflows/execute \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_name": "echo",
    "parameters": {
      "message": "Hello, Workflow!"
    }
  }'
```

#### 预期响应
```json
{
  "success": true,
  "result": {
    "echo": "Hello, Workflow!"
  }
}
```

#### 验证点
- [ ] Workflow 执行成功
- [ ] 返回正确的 echo 内容
- [ ] 响应格式正确

---

### 测试 12: ExecuteCommandWorkflow

**目的**：测试命令执行 workflow（取代了已弃用的 execute_command 工具）

#### API 测试
```bash
curl -X POST http://localhost:8000/v1/workflows/execute \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_name": "execute_command",
    "parameters": {
      "command": "echo \"Test command\""
    }
  }'
```

#### 预期响应
```json
{
  "success": true,
  "result": {
    "exit_code": 0,
    "stdout": "Test command\n",
    "stderr": "",
    "message": "Command executed successfully"
  }
}
```

#### 验证点
- [ ] 命令成功执行
- [ ] stdout 包含预期输出
- [ ] exit_code 为 0
- [ ] 5分钟超时保护生效

#### 安全测试
- [ ] 尝试危险命令（应被 approval 机制拦截）
- [ ] 验证 custom_prompt 包含安全警告

---

### 测试 13: DeleteFileWorkflow

**目的**：测试文件删除 workflow（需要明确确认）

#### 准备
```bash
# 创建测试文件
echo "Test content" > /tmp/test_delete.txt
```

#### API 测试
```bash
# 测试1：没有确认（应失败）
curl -X POST http://localhost:8000/v1/workflows/execute \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_name": "delete_file",
    "parameters": {
      "path": "/tmp/test_delete.txt",
      "confirm": "wrong"
    }
  }'

# 预期：错误 "Deletion not confirmed..."

# 测试2：有确认（应成功）
curl -X POST http://localhost:8000/v1/workflows/execute \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_name": "delete_file",
    "parameters": {
      "path": "/tmp/test_delete.txt",
      "confirm": "DELETE"
    }
  }'

# 验证文件被删除
ls /tmp/test_delete.txt  # 应该显示 "No such file"
```

#### 验证点
- [ ] 没有 "DELETE" 确认时拒绝删除
- [ ] 有 "DELETE" 确认时成功删除
- [ ] 文件实际被删除
- [ ] 不存在的文件返回错误

---

### 测试 14: CreateFileWorkflow

**目的**：验证 workflow 版本的 create_file

#### API 测试
```bash
curl -X POST http://localhost:8000/v1/workflows/execute \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_name": "create_file",
    "parameters": {
      "path": "/tmp/workflow_test.txt",
      "content": "Created by workflow"
    }
  }'

# 验证文件创建
cat /tmp/workflow_test.txt
```

#### 验证点
- [ ] 文件成功创建
- [ ] 内容正确
- [ ] 如果目录不存在，自动创建父目录

---

## ⚠️ 弃用端点测试

### 测试 15: 弃用警告

**目的**：验证弃用端点返回警告

#### API 测试
```bash
# 测试弃用的 execute_tool 端点
curl -X POST http://localhost:8000/tools/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool_name": "read_file",
    "parameters": {
      "path": "README.md"
    }
  }' \
  -i  # 显示 headers
```

#### 验证点
- [ ] 响应 headers 包含 `X-Deprecated: true`
- [ ] 后端日志包含弃用警告
- [ ] 功能仍然工作（向后兼容）

#### 后端日志检查
```
WARN [tool_controller] Deprecated endpoint called: /tools/execute
```

---

## 🧪 集成测试

### 测试 16: 完整对话流程

**目的**：测试完整的多轮对话，包含工具调用

#### 场景
```
用户: 请帮我分析项目结构
 ↓
LLM: [调用 search 工具搜索文件]
 ↓
Agent Loop: [执行 search，返回结果]
 ↓
LLM: [调用 read_file 读取关键文件]
 ↓
Agent Loop: [执行 read_file，返回内容]
 ↓
LLM: [返回最终分析结果]
 ↓
用户: 请创建一个 TODO.md 文件总结你的发现
 ↓
LLM: [调用 create_file 工具]
 ↓
Agent Loop: [检测需要批准，暂停]
 ↓
前端: [显示批准模态框]
 ↓
用户: [批准]
 ↓
Agent Loop: [执行 create_file，文件创建]
 ↓
LLM: [确认完成]
```

#### 验证点
- [ ] 完整流程无中断
- [ ] 工具调用正确执行
- [ ] 批准机制正常工作
- [ ] 对话历史正确保存
- [ ] 用户体验流畅

---

## 📝 测试检查清单

### 冒烟测试 (必须)
- [ ] 应用启动成功
- [ ] 基本聊天功能工作
- [ ] 零编译错误
- [ ] 零linter错误

### Agent Loop 功能
- [ ] read_file 工具自动调用
- [ ] search 工具自动调用
- [ ] 多步骤工具链工作
- [ ] 工具结果正确传递

### 批准机制
- [ ] create_file 需要批准
- [ ] 批准 API 端点工作
- [ ] 拒绝工具调用工作
- [ ] 批准请求正确存储

### 错误处理
- [ ] 工具执行失败被捕获
- [ ] 错误反馈给 LLM
- [ ] 超时机制工作
- [ ] 最大重试次数生效
- [ ] 最大迭代次数生效

### Workflow 系统
- [ ] 列出 workflows 工作
- [ ] EchoWorkflow 执行成功
- [ ] ExecuteCommandWorkflow 工作
- [ ] DeleteFileWorkflow 工作（带确认）
- [ ] CreateFileWorkflow 工作

### 弃用警告
- [ ] 弃用端点返回警告
- [ ] 警告记录到日志
- [ ] 功能仍然向后兼容

---

## 🔍 调试技巧

### 查看后端日志
```bash
# 启动时显示所有日志
RUST_LOG=debug cargo run --bin web_service
```

### 关键日志位置
- **Agent Loop 开始**: `[AgentService] Starting agent loop`
- **工具调用**: `[AgentService] Executing tool: {tool_name}`
- **批准请求**: `[ChatService] Tool requires approval`
- **错误**: `[AgentService] Tool execution failed`
- **迭代**: `[AgentService] Iteration {n}`

### 数据库检查
```sql
-- 查看聊天上下文
SELECT * FROM chat_sessions WHERE id = '<session-id>';

-- 查看消息历史
SELECT * FROM messages WHERE session_id = '<session-id>' ORDER BY created_at;

-- 查看工具调用记录（如果实现了）
SELECT * FROM tool_call_history WHERE session_id = '<session-id>';
```

### API 调试
使用 `httpie` 或 `Postman` 进行更友好的 API 测试：

```bash
# 安装 httpie
brew install httpie

# 使用示例
http POST localhost:8000/v1/workflows/execute \
  workflow_name=echo \
  parameters:='{"message": "test"}'
```

---

## ⚡ 自动化测试建议

### 单元测试（推荐）

```rust
// crates/web_service/src/services/approval_manager.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_create_and_approve_request() {
        let manager = ApprovalManager::new();
        let session_id = Uuid::new_v4();
        let tool_call = /* ... */;
        
        // 创建请求
        let request_id = manager.create_request(
            session_id, 
            tool_call, 
            "test_tool".to_string(),
            "Test description".to_string()
        ).await.unwrap();
        
        // 验证请求存在
        let pending = manager.get_pending_request(&session_id).await;
        assert!(pending.is_some());
        
        // 批准请求
        let result = manager.approve_request(&request_id, true, None).await;
        assert!(result.is_ok());
        
        // 验证请求被移除
        let pending = manager.get_pending_request(&session_id).await;
        assert!(pending.is_none());
    }
}
```

### 集成测试（推荐）

```rust
// crates/web_service/tests/agent_loop_tests.rs
#[tokio::test]
async fn test_agent_loop_with_approval() {
    // 启动测试服务器
    let app_state = create_test_app_state().await;
    
    // 发送需要批准的消息
    let response = send_message(
        app_state.clone(),
        "Create a test file"
    ).await;
    
    // 验证返回批准请求
    assert!(matches!(response, ServiceResponse::AwaitingAgentApproval { .. }));
    
    // 批准
    approve_agent_tool_call(app_state, request_id, true).await;
    
    // 验证工具执行
    assert!(Path::new("test_file.txt").exists());
}
```

---

## 📊 测试报告模板

完成测试后，使用此模板记录结果：

```markdown
# Agent Loop 测试报告
日期: YYYY-MM-DD
测试人员: [你的名字]

## 测试环境
- OS: macOS / Linux / Windows
- Rust版本: [cargo --version]
- Node版本: [node --version]

## 测试结果总结
- 总测试数: X
- 通过: Y
- 失败: Z
- 跳过: W

## 详细结果

### ✅ 通过的测试
1. read_file 工具调用 - ✅
2. search 工具调用 - ✅
...

### ❌ 失败的测试
1. create_file 批准 - ❌
   - 原因: 批准模态框未显示
   - 错误信息: [详细错误]
   - 待修复

### ⏭️ 跳过的测试
1. 前端批准 UI - ⏭️
   - 原因: 前端集成未完成
   - 计划: 下一个sprint完成

## 发现的问题
1. [问题1描述]
2. [问题2描述]

## 建议
1. [改进建议1]
2. [改进建议2]
```

---

## 🎯 优先级

### P0 - 必须测试（阻塞发布）
- [ ] 基本聊天功能
- [ ] read_file 工具调用
- [ ] 工具执行失败处理
- [ ] Workflow 执行

### P1 - 应该测试（重要功能）
- [ ] 多步骤工具链
- [ ] 工具批准机制
- [ ] 超时处理
- [ ] 所有 workflows

### P2 - 可以测试（非关键）
- [ ] 弃用警告
- [ ] 最大迭代次数
- [ ] 边界情况

---

## 📞 获取帮助

如果遇到问题：
1. 检查后端日志（`RUST_LOG=debug`）
2. 查看文档（`docs/architecture/`）
3. 参考实现总结（`IMPLEMENTATION_SESSION_COMPLETE.md`）

---

## ✨ 测试完成后

完成测试后：
1. 记录测试结果
2. 创建 issue 跟踪失败的测试
3. 更新文档（如有需要）
4. 准备下一阶段工作

---

**Good luck with testing! 🚀**

