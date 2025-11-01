# LLM Integration Guide

## Why Mock Responses?

The **backend-first persistence refactor** focused on building the **infrastructure** for automatic message persistence, not on implementing LLM calls. The mock responses allow us to:

1. ✅ **Test persistence** without needing API keys or network
2. ✅ **Verify FSM state transitions** work correctly
3. ✅ **Validate message flow** from frontend to backend and back
4. ✅ **Ensure auto-save hooks** trigger at the right times

## Current Flow (With Mock)

```
User sends "hi"
     ↓
Backend FSM enters ProcessingUserMessage state
     ↓
⚠️  Creates MOCK response: "I'm a mock response..."
     ↓
Adds mock message to context
     ↓
Auto-saves to database
     ↓
Returns complete context
```

## How to Integrate Real LLM

### Step 1: Understand the LLM Client

Your app already has LLM infrastructure:

- **Trait**: `CopilotClientTrait` (`crates/copilot_client/src/client_trait.rs`)
- **Implementation**: `CopilotClient` (`crates/copilot_client/src/api/client.rs`)
- **Method**: `send_chat_completion_request(request: ChatCompletionRequest)`

### Step 2: See Working Examples

Check these files for reference:

**Non-streaming example:**
```rust
// crates/web_service/src/controllers/openai_controller.rs (lines 94-106)
let response = app_state
    .copilot_client
    .send_chat_completion_request(request)
    .await?;

let body = response.bytes().await?;
// Parse body to extract assistant message
```

**Streaming example:**
```rust
// crates/web_service/src/controllers/openai_controller.rs (lines 58-92)
let (tx, rx) = mpsc::channel(10);
let response = client.send_chat_completion_request(request).await?;

// Process stream chunks
client.process_chat_completion_stream(response, tx).await?;
```

### Step 3: Replace Mock in FSM

**Location**: `crates/web_service/src/services/chat_service.rs:149-199`

**What you need to do:**

```rust
ContextState::ProcessingUserMessage => {
    log::info!("FSM: Entered ProcessingUserMessage state");
    
    // Step 1: Extract messages from context
    let (model_id, messages) = {
        let ctx = context.lock().await;
        let msgs = ctx
            .get_active_branch()
            .map(|branch| {
                branch
                    .message_ids
                    .iter()
                    .filter_map(|id| ctx.message_pool.get(id))
                    .map(|node| &node.message)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        (ctx.config.model_id.clone(), msgs)
    };
    
    // Step 2: Convert to ChatCompletionRequest
    let chat_messages: Vec<copilot_client::api::models::ChatMessage> = 
        messages.into_iter().map(|msg| {
            copilot_client::api::models::ChatMessage {
                role: convert_role(&msg.role),
                content: convert_content(&msg.content),
                tool_calls: msg.tool_calls.clone(), // May need conversion
                tool_call_id: None,
            }
        }).collect();
    
    let request = copilot_client::api::models::ChatCompletionRequest {
        model: model_id,
        messages: chat_messages,
        stream: Some(false), // Start with non-streaming
        tools: None, // Add later for tool support
        tool_choice: None,
        ..Default::default()
    };
    
    // Step 3: Call LLM
    log::info!("Calling real LLM...");
    match self.copilot_client.send_chat_completion_request(request).await {
        Ok(response) => {
            // Step 4: Parse response
            let body = response.bytes().await?;
            let completion: serde_json::Value = serde_json::from_slice(&body)?;
            
            let assistant_text = completion
                ["choices"][0]["message"]["content"]
                .as_str()
                .unwrap_or("(empty response)")
                .to_string();
            
            log::info!("LLM response received: {} chars", assistant_text.len());
            
            // Step 5: Add to context
            let mut context_lock = context.lock().await;
            let assistant_message = InternalMessage {
                role: Role::Assistant,
                content: vec![ContentPart::Text { text: assistant_text }],
                ..Default::default()
            };
            context_lock.add_message_to_branch("main", assistant_message);
            context_lock.current_state = ContextState::Idle;
            drop(context_lock);
            
            // Step 6: Auto-save
            self.auto_save_context(&context).await?;
        }
        Err(e) => {
            log::error!("LLM call failed: {:?}", e);
            // Handle error (add error message to context, etc.)
        }
    }
}
```

### Step 4: Helper Functions You'll Need

```rust
// Convert internal Role to copilot_client Role
fn convert_role(role: &context_manager::structs::message::Role) 
    -> copilot_client::api::models::Role 
{
    use context_manager::structs::message::Role as InternalRole;
    use copilot_client::api::models::Role as ClientRole;
    
    match role {
        InternalRole::User => ClientRole::User,
        InternalRole::Assistant => ClientRole::Assistant,
        InternalRole::System => ClientRole::System,
        InternalRole::Tool => ClientRole::Tool,
    }
}

// Convert content parts to client Content format
fn convert_content(parts: &[ContentPart]) -> copilot_client::api::models::Content {
    // Implementation depends on your Content enum structure
    // Check copilot_client::api::models::Content for format
    todo!("Convert ContentPart to client Content format")
}
```

### Step 5: Handle Streaming (Optional, Later)

For streaming responses (better UX), you'll need to:

1. Use `process_chat_completion_stream()` instead
2. Set up a channel to receive chunks
3. Update frontend to handle Server-Sent Events (SSE)
4. Update context incrementally as chunks arrive

See `openai_controller.rs` lines 58-92 for a complete streaming implementation.

### Step 6: Test

After integration:

```bash
# Restart backend
cd crates/web_service
cargo run

# Test from UI or curl
curl -X POST http://localhost:8080/v1/contexts/{ID}/actions/send_message \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello!"}'
```

Backend logs should show:
```
INFO  Calling real LLM...
INFO  LLM response received: 42 chars
```

## Why This Wasn't Done Yet

The refactor focused on **infrastructure**:
- ✅ Dirty flag optimization
- ✅ Auto-save hooks
- ✅ FSM state management
- ✅ Action-based API
- ✅ Frontend integration

LLM integration requires:
- ❌ Message format conversion
- ❌ Error handling for API failures
- ❌ Streaming support
- ❌ Tool call handling
- ❌ Rate limiting / retries

These are **separate concerns** that should be implemented after the persistence foundation is solid.

## Current Status

✅ **Persistence works perfectly** - Both user and assistant messages are auto-saved

⚠️ **LLM integration is stubbed** - Returns mock responses for testing

🎯 **Next step**: Follow this guide to integrate real LLM calls

## Need Help?

Check these files for working examples:
- `crates/web_service/src/controllers/openai_controller.rs` - Full LLM integration
- `crates/web_service/tests/openai_api_tests.rs` - Test examples
- `crates/copilot_client/src/api/models.rs` - Request/response models
- `crates/copilot_client/src/client_trait.rs` - Client interface

The infrastructure is ready - you just need to plug in the LLM client! 🚀

