# Plan/Act Mode System Prompt Enhancement - Implementation Status

## 当前状态

### ✅ 已实现的部分

1. **SystemPromptEnhancer 服务** (`crates/web_service/src/services/system_prompt_enhancer.rs`)
   - ✅ `build_role_section()` 方法已实现
   - ✅ Planner 角色提示包含：
     - 只读权限说明
     - 计划 JSON 格式要求
     - 工具限制说明
   - ✅ Actor 角色提示包含：
     - 完整权限说明
     - 问题 JSON 格式要求
     - 自主决策指南

2. **角色检测和工具过滤**
   - ✅ `build_tools_section()` 根据角色权限过滤工具
   - ✅ Planner 角色只能看到 ReadFiles 权限的工具
   - ✅ Actor 角色可以看到所有工具

### ❌ 缺失的部分

**问题：`chat_service.rs` 没有使用 SystemPromptEnhancer**

当前 `chat_service.rs` 在构建 messages 时：
1. 从 context 获取 messages（第198-208行）
2. 直接转换 messages 为 ChatMessage（第226-227行）
3. **没有获取 system prompt**
4. **没有使用 SystemPromptEnhancer 增强 system prompt**

## 需要修改的地方

### 在 `chat_service.rs` 中集成 SystemPromptEnhancer

**位置 1：`process_message()` 方法（第146行开始）**

需要修改：
```rust
// 当前代码（第197-227行）
let messages: Vec<InternalMessage> = context_lock
    .get_active_branch()
    .map(|branch| {
        branch.message_ids
            .iter()
            .filter_map(|id| context_lock.message_pool.get(id))
            .map(|node| node.message.clone())
            .collect()
    })
    .unwrap_or_default();
let chat_messages: Vec<ChatMessage> =
    messages.iter().map(convert_to_chat_message).collect();
```

**应该改为：**
```rust
// 1. 获取 system prompt（如果有）
let system_prompt_content = context_lock
    .get_active_branch()
    .and_then(|branch| branch.system_prompt.as_ref())
    .map(|sp| sp.content.clone());

// 2. 获取 agent_role
let agent_role = &context_lock.config.agent_role;

// 3. 使用 enhancer 增强 system prompt
let enhanced_system_prompt = if let Some(base_prompt) = system_prompt_content {
    self.system_prompt_enhancer
        .enhance_prompt(&base_prompt, agent_role)
        .await
        .unwrap_or_else(|e| {
            log::error!("Failed to enhance prompt: {}", e);
            base_prompt
        })
} else {
    // 如果没有 base prompt，只添加角色指令
    self.system_prompt_enhancer
        .build_role_section(agent_role)
        .clone()
};

// 4. 构建 messages，将增强后的 system prompt 放在开头
let mut chat_messages = Vec::new();
if !enhanced_system_prompt.is_empty() {
    chat_messages.push(ChatMessage {
        role: ClientRole::System,
        content: Content::Text(enhanced_system_prompt),
        tool_calls: None,
        tool_call_id: None,
    });
}

// 5. 添加其他 messages
let messages: Vec<InternalMessage> = context_lock
    .get_active_branch()
    .map(|branch| {
        branch.message_ids
            .iter()
            .filter_map(|id| context_lock.message_pool.get(id))
            .map(|node| node.message.clone())
            .collect()
    })
    .unwrap_or_default();

for msg in messages.iter() {
    chat_messages.push(convert_to_chat_message(msg));
}
```

**位置 2：`ChatService` struct 需要添加 `system_prompt_enhancer` 字段**

```rust
pub struct ChatService<T: StorageProvider> {
    session_manager: Arc<ChatSessionManager<T>>,
    conversation_id: Uuid,
    copilot_client: Arc<dyn CopilotClientTrait>,
    tool_executor: Arc<ToolExecutor>,
    system_prompt_enhancer: Arc<SystemPromptEnhancer>, // 新增
}
```

**位置 3：`ChatService::new()` 方法需要接收 enhancer**

```rust
pub fn new(
    session_manager: Arc<ChatSessionManager<T>>,
    conversation_id: Uuid,
    copilot_client: Arc<dyn CopilotClientTrait>,
    tool_executor: Arc<ToolExecutor>,
    system_prompt_enhancer: Arc<SystemPromptEnhancer>, // 新增
) -> Self {
    Self {
        session_manager,
        conversation_id,
        copilot_client,
        tool_executor,
        system_prompt_enhancer, // 新增
    }
}
```

**位置 4：创建 ChatService 的地方需要传入 enhancer**

在 `context_controller.rs` 中（第580行附近）：
```rust
let mut chat_service = crate::services::chat_service::ChatService::new(
    app_state.session_manager.clone(),
    context_id,
    app_state.copilot_client.clone(),
    app_state.tool_executor.clone(),
    app_state.system_prompt_enhancer.clone(), // 新增
);
```

## 如何查看增强后的 Prompt

### 后端日志

增强后的 prompt 会通过日志输出，可以在后端日志中查看：
```bash
# 查看后端日志
tail -f logs/web_service.log
# 或查看控制台输出
```

### 前端显示（当前不可用）

目前前端没有显示增强后的 prompt 的 UI。可以考虑：

1. **在 SystemMessageCard 中显示增强后的 prompt**
   - 显示完整的增强后的 system prompt
   - 包含角色特定的指令部分

2. **添加一个 "View Enhanced Prompt" 按钮**
   - 点击后显示完整的增强后的 prompt
   - 可以展开/折叠查看各个部分

3. **在聊天设置中显示**
   - 在系统设置中显示当前使用的增强后的 prompt
   - 允许用户查看完整的 prompt 内容

## 总结

- ✅ SystemPromptEnhancer **已经实现**了角色特定的指令
- ❌ ChatService **还没有使用** SystemPromptEnhancer
- ❌ 增强后的 prompt **不会**自动添加到 messages 中
- ❌ 前端**没有**显示增强后的 prompt 的地方

需要完成上述修改，才能让 Plan/Act mode 的 system prompt 增强生效。

