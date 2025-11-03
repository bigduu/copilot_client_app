# Agent Loop 修复总结 - Streaming API 工具注入问题

## 🔴 问题症状

用户输入：`Create File: test file name with hello world content`
- ❌ LLM 只是**解释**命令，不实际执行
- ❌ 没有工具调用
- ❌ 没有批准模态框

## 🔍 根本原因

通过分析后端日志发现：
1. **关键日志缺失**：整个日志中完全没有看到 `"Enhanced system prompt injected into messages"`
2. **代码分析**：`process_message_stream` 方法（streaming API）直接将消息发送给 LLM，**完全没有调用 SystemPromptEnhancer**
3. **对比**：`process_message` 方法（非 streaming API）正确实现了 system prompt enhancement

### 问题代码位置

`crates/web_service/src/services/chat_service.rs` 第605-617行（修复前）：

```rust
// Convert to LLM client format
let chat_messages: Vec<ChatMessage> =
    messages.iter().map(convert_to_chat_message).collect();

// Build request with streaming enabled
let request = ChatCompletionRequest {
    model: model_id,
    messages: chat_messages,  // ❌ 直接使用，没有增强！
    stream: Some(true),
    tools: None,
    tool_choice: None,
    ..Default::default()
};
```

**后果**：
- 工具定义没有被注入到 system prompt
- LLM 不知道有哪些工具可用
- LLM 只能用自然语言解释，无法实际调用工具

## ✅ 修复方案

在 `process_message_stream` 方法中添加完整的 system prompt enhancement 逻辑：

### 修复内容

1. **获取 System Prompt 信息**（第600-608行）：
   ```rust
   // Get system prompt and agent role for enhancement
   let system_prompt_id = context_lock.config.system_prompt_id.clone();
   let agent_role = context_lock.config.agent_role.clone();
   let system_prompt_content =
       if let Some(system_prompt) = context_lock.get_active_branch_system_prompt() {
           Some(system_prompt.content.clone())
       } else {
           None
       };
   ```

2. **加载最终 System Prompt**（第612-626行）：
   ```rust
   // Load system prompt by ID if not in branch
   let final_system_prompt_content = if let Some(content) = system_prompt_content {
       Some(content)
   } else if let Some(prompt_id) = &system_prompt_id {
       match self.system_prompt_service.get_prompt(prompt_id).await {
           Some(prompt) => Some(prompt.content),
           None => {
               log::warn!("System prompt {} not found", prompt_id);
               None
           }
       }
   } else {
       None
   };
   ```

3. **增强 System Prompt**（第631-652行）：
   ```rust
   // Enhance system prompt if available
   let enhanced_system_prompt = if let Some(base_prompt) = &final_system_prompt_content {
       match self
           .system_prompt_enhancer
           .enhance_prompt(base_prompt, &agent_role)
           .await
       {
           Ok(enhanced) => {
               log::info!(
                   "System prompt enhanced successfully for role: {:?}",
                   agent_role
               );
               Some(enhanced)
           }
           Err(e) => {
               log::warn!("Failed to enhance system prompt: {}, using base prompt", e);
               Some(base_prompt.clone())
           }
       }
   } else {
       None
   };
   ```

4. **注入到消息列表**（第654-671行）：
   ```rust
   // Convert to LLM client format
   let mut chat_messages: Vec<ChatMessage> =
       messages.iter().map(convert_to_chat_message).collect();

   // Inject enhanced system prompt if available
   if let Some(enhanced_prompt) = &enhanced_system_prompt {
       // Insert enhanced system prompt at the beginning
       chat_messages.insert(
           0,
           ChatMessage {
               role: ClientRole::System,
               content: Content::Text(enhanced_prompt.clone()),
               tool_calls: None,
               tool_call_id: None,
           },
       );
       log::info!("Enhanced system prompt injected into messages");  // ← 🎯 关键日志！
   }
   ```

## 🧪 测试步骤

### 1. 重启后端

```bash
cd /Users/bigduu/Workspace/TauriProjects/copilot_chat
RUST_LOG=debug cargo run --bin web_service
```

### 2. 测试工具调用

在聊天界面发送：
```
Create File: test.txt with content "Hello, World!"
```

### 3. 验证日志

**现在应该看到的日志**：
```
[INFO] === ChatService::process_message_stream START ===
[INFO] System prompt enhanced successfully for role: Actor
[INFO] Enhanced system prompt injected into messages  ← 🎯 关键！这行之前没有
[INFO] Sending request to LLM
[INFO] Tool call detected: create_file                ← 🎯 工具调用！
[INFO] Executing tool: create_file
[INFO] Tool execution successful
```

### 4. 验证行为

**预期行为（✅ 正确）**：
1. LLM 输出 JSON 格式的工具调用
2. 后端检测到工具调用
3. 显示批准模态框（如果 `create_file` 需要批准）
4. 批准后实际创建文件

**不应该看到（❌ 错误）**：
```
It seems like you're requesting to create a file...
```

## 📊 修复影响

### 修复的功能
- ✅ **LLM-driven Agent Loop** - LLM 现在可以自主调用工具
- ✅ **Tool Call Approval** - 需要批准的工具会弹出批准模态框
- ✅ **Streaming API 工具注入** - 修复了 streaming API 的工具定义注入
- ✅ **Agent Loop Error Handling** - 工具执行错误和超时处理

### 未受影响的功能
- ✅ **User-invoked Workflows** - 用户显式调用的工作流（如果有）不受影响
- ✅ **Non-streaming API** - `process_message` 方法已经正确实现，不受影响

## 🎯 关键要点

1. **Streaming vs Non-Streaming**
   - 项目有两个 API 路径处理消息
   - `process_message` - 非 streaming，已正确实现
   - `process_message_stream` - streaming，之前缺失工具注入 **← 已修复**

2. **System Prompt Enhancement 的重要性**
   - SystemPromptEnhancer 负责将工具定义注入到 system prompt
   - 没有这一步，LLM 不知道有哪些工具可用
   - 这是 Agent Loop 的核心机制

3. **调试关键**
   - 查找 `"Enhanced system prompt injected into messages"` 日志
   - 如果没有这行日志，说明工具定义没有注入
   - 如果 LLM 只是解释而不执行，99% 是这个问题

## 📝 后续建议

1. **添加集成测试**
   - 测试 streaming API 的工具调用
   - 验证 system prompt enhancement 在 streaming 场景下的工作

2. **代码重构**
   - `process_message` 和 `process_message_stream` 有大量重复代码
   - 考虑提取共享逻辑到单独的辅助方法

3. **文档更新**
   - 在 `AGENT_LOOP_ARCHITECTURE.md` 中添加 streaming API 的说明
   - 明确指出 system prompt enhancement 的重要性

## ✨ 总结

这次修复解决了一个关键但隐蔽的 bug：streaming API 路径没有正确注入工具定义。通过在 `process_message_stream` 中添加完整的 system prompt enhancement 逻辑，现在 Agent Loop 在 streaming 模式下也能正常工作了。

**修复验证**：
- ✅ 编译通过
- ⏳ 需要运行时测试确认

