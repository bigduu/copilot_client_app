# Plan/Act Mode System Prompt Enhancement - Implementation Status

## Current Status

### ✅ Implemented Parts

1. **SystemPromptEnhancer Service** (`crates/web_service/src/services/system_prompt_enhancer.rs`)
   - ✅ `build_role_section()` method implemented
   - ✅ Planner role prompts include:
     - Read-only permission description
     - Plan JSON format requirements
     - Tool restriction description
   - ✅ Actor role prompts include:
     - Full permission description
     - Question JSON format requirements
     - Autonomous decision guidelines

2. **Role Detection and Tool Filtering**
   - ✅ `build_tools_section()` filters tools based on role permissions
   - ✅ Planner role can only see tools with ReadFiles permission
   - ✅ Actor role can see all tools

### ❌ Missing Parts

**Issue: `chat_service.rs` is not using SystemPromptEnhancer**

Currently `chat_service.rs` when building messages:
1. Gets messages from context (lines 198-208)
2. Directly converts messages to ChatMessage (lines 226-227)
3. **Does not get system prompt**
4. **Does not use SystemPromptEnhancer to enhance system prompt**

## Changes Needed

### Integrate SystemPromptEnhancer in `chat_service.rs`

**Location 1: `process_message()` method (starting at line 146)**

Needs modification:
```rust
// Current code (lines 197-227)
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

**Should be changed to:**
```rust
// 1. Get system prompt (if exists)
let system_prompt_content = context_lock
    .get_active_branch()
    .and_then(|branch| branch.system_prompt.as_ref())
    .map(|sp| sp.content.clone());

// 2. Get agent_role
let agent_role = &context_lock.config.agent_role;

// 3. Use enhancer to enhance system prompt
let enhanced_system_prompt = if let Some(base_prompt) = system_prompt_content {
    self.system_prompt_enhancer
        .enhance_prompt(&base_prompt, agent_role)
        .await
        .unwrap_or_else(|e| {
            log::error!("Failed to enhance prompt: {}", e);
            base_prompt
        })
} else {
    // If no base prompt, only add role instructions
    self.system_prompt_enhancer
        .build_role_section(agent_role)
        .clone()
};

// 4. Build messages, put enhanced system prompt at the beginning
let mut chat_messages = Vec::new();
if !enhanced_system_prompt.is_empty() {
    chat_messages.push(ChatMessage {
        role: ClientRole::System,
        content: Content::Text(enhanced_system_prompt),
        tool_calls: None,
        tool_call_id: None,
    });
}

// 5. Add other messages
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

**Location 2: `ChatService` struct needs to add `system_prompt_enhancer` field**

```rust
pub struct ChatService<T: StorageProvider> {
    session_manager: Arc<ChatSessionManager<T>>,
    conversation_id: Uuid,
    copilot_client: Arc<dyn CopilotClientTrait>,
    tool_executor: Arc<ToolExecutor>,
    system_prompt_enhancer: Arc<SystemPromptEnhancer>, // NEW
}
```

**Location 3: `ChatService::new()` method needs to accept enhancer**

```rust
pub fn new(
    session_manager: Arc<ChatSessionManager<T>>,
    conversation_id: Uuid,
    copilot_client: Arc<dyn CopilotClientTrait>,
    tool_executor: Arc<ToolExecutor>,
    system_prompt_enhancer: Arc<SystemPromptEnhancer>, // NEW
) -> Self {
    Self {
        session_manager,
        conversation_id,
        copilot_client,
        tool_executor,
        system_prompt_enhancer, // NEW
    }
}
```

**Location 4: Where ChatService is created needs to pass enhancer**

In `context_controller.rs` (around line 580):
```rust
let mut chat_service = crate::services::chat_service::ChatService::new(
    app_state.session_manager.clone(),
    context_id,
    app_state.copilot_client.clone(),
    app_state.tool_executor.clone(),
    app_state.system_prompt_enhancer.clone(), // NEW
);
```

## How to View Enhanced Prompt

### Backend Logs

The enhanced prompt will be output through logs, which can be viewed in backend logs:
```bash
# View backend logs
tail -f logs/web_service.log
# Or view console output
```

### Frontend Display (Currently Unavailable)

Currently the frontend does not have UI to display the enhanced prompt. Options to consider:

1. **Display enhanced prompt in SystemMessageCard**
   - Show the complete enhanced system prompt
   - Include role-specific instruction sections

2. **Add a "View Enhanced Prompt" button**
   - Click to show the complete enhanced prompt
   - Can expand/collapse to view different sections

3. **Display in chat settings**
   - Show the currently used enhanced prompt in system settings
   - Allow users to view the complete prompt content

## Summary

- ✅ SystemPromptEnhancer **already implements** role-specific instructions
- ❌ ChatService **is not yet using** SystemPromptEnhancer
- ❌ Enhanced prompt **will not** be automatically added to messages
- ❌ Frontend **does not have** a place to display the enhanced prompt

The above modifications need to be completed for Plan/Act mode system prompt enhancement to take effect.

