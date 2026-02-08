# Streaming API Future Upgrade Guide

**Created Date**: 2025-11-08
**Status**: 📋 Optional Upgrade (Not Required)

---

## Overview

The `chat_service.rs` uses the **existing stable streaming processing API**, which works correctly. Phase 1.5 implemented the **new Signal-Pull architecture streaming API**, providing more features. Both APIs can coexist, and migrating to the new API is an optional architectural upgrade, not a mandatory cleanup task.

---

## Old API vs New API Comparison

### 1. Start Streaming Response

#### ❌ Old API (chat_service.rs line 688)
```rust
// Returns (message_id, Vec<ContextUpdate>)
let result = ctx.begin_streaming_response();
let (message_id, _updates) = result;
```

#### ✅ New API (Phase 1.5)
```rust
// Returns message_id, handles state transition internally
let message_id = ctx.begin_streaming_llm_response(Some("gpt-4".to_string()));
```

**Advantages**:
- New API supports specifying model name
- Uses `RichMessageType::StreamingResponse`
- Automatically creates `StreamingResponseMsg` and metadata

---

### 2. Append Streaming Content

#### ❌ Old API (chat_service.rs line 700)
```rust
// Returns Option<(ContextUpdate, u64)>
ctx.apply_streaming_delta(message_id, content.clone());
```

#### ✅ New API (Phase 1.5)
```rust
// Returns Option<u64> sequence number
let sequence = ctx.append_streaming_chunk(message_id, content);
```

**Advantages**:
- New API supports sequence number tracking (Signal-Pull core)
- Automatically records `StreamChunk` metadata
- Supports incremental content pulling

---

### 3. Complete Streaming Response

#### ❌ Old API (chat_service.rs line 736)
```rust
// Returns Vec<ContextUpdate>
let _updates = ctx.finish_streaming_response(message_id);
```

#### ✅ New API (Phase 1.5)
```rust
// Returns bool, supports complete metadata
let finalized = ctx.finalize_streaming_response(
    message_id,
    Some("stop".to_string()),    // finish_reason
    Some(usage)                   // TokenUsage
);
```

**Advantages**:
- New API supports `finish_reason` and `usage` statistics
- Automatically calculates streaming metadata (duration, chunk intervals)
- Saves `StreamingMetadata` to `MessageMetadata`

---

### 4. Abort Streaming Response

#### ❌ Old API (chat_service.rs line 714)
```rust
// Returns Vec<ContextUpdate>
let _ = ctx.abort_streaming_response(
    message_id,
    format!("stream error: {}", e),
);
```

#### ✅ New API (Phase 1.5)
```rust
// Should use finalize_streaming_response with error marking
let _ = ctx.finalize_streaming_response(
    message_id,
    Some(format!("error: {}", e)),  // finish_reason records error
    None                             // no usage
);
```

**Note**: The new architecture does not have a separate `abort` method; errors are recorded through `finish_reason`

---

## Affected Files

### web_service/src/services/chat_service.rs

**Locations using old API**:

1. **Line 688** - `process_message` method
   ```rust
   let result = ctx.begin_streaming_response();
   ```

2. **Line 700** - `process_message` method
   ```rust
   ctx.apply_streaming_delta(message_id, content.clone());
   ```

3. **Line 714** - `process_message` method error handling
   ```rust
   ctx.abort_streaming_response(message_id, format!("stream error: {}", e));
   ```

4. **Line 736** - `process_message` method completion
   ```rust
   ctx.finish_streaming_response(message_id);
   ```

**Other potentially affected locations**:
- `copilot_stream_handler.rs` - may also use old API
- `agent_loop_runner.rs` - may also use old API

---

## Migration Steps

### Phase 1: Migrate chat_service.rs

#### 1.1 Modify `begin_streaming_response` call

**Location**: Lines 685-693

**Before**:
```rust
let (message_id, _) = {
    let mut ctx = context.write().await;
    // begin_streaming_response already handles state transition
    let result = ctx.begin_streaming_response();
    log::info!(
        "FSM: AwaitingLLMResponse -> StreamingLLMResponse"
    );
    result
};
```

**After**:
```rust
let message_id = {
    let mut ctx = context.write().await;
    // Use new Phase 1.5 API
    let model = llm_request.prepared.model_id.clone();
    let message_id = ctx.begin_streaming_llm_response(Some(model));
    log::info!(
        "FSM: AwaitingLLMResponse -> StreamingLLMResponse (message_id: {})",
        message_id
    );
    message_id
};
```

#### 1.2 Modify `apply_streaming_delta` call

**Location**: Lines 698-701

**Before**:
```rust
let mut ctx = context.write().await;
// apply_streaming_delta already updates state, no need for manual event
ctx.apply_streaming_delta(message_id, content.clone());
```

**After**:
```rust
let mut ctx = context.write().await;
// Use new Phase 1.5 API, returns sequence number
if let Some(sequence) = ctx.append_streaming_chunk(message_id, content) {
    log::trace!("Appended chunk, sequence: {}", sequence);
}
```

#### 1.3 Modify `abort_streaming_response` call

**Location**: Lines 712-717

**Before**:
```rust
let mut ctx = context.write().await;
// abort_streaming_response already handles error state transition
let _ = ctx.abort_streaming_response(
    message_id,
    format!("stream error: {}", e),
);
```

**After**:
```rust
let mut ctx = context.write().await;
// Use finalize to mark error
let error_msg = format!("stream error: {}", e);
ctx.finalize_streaming_response(
    message_id,
    Some(error_msg),  // finish_reason records error
    None              // no usage data
);
```

#### 1.4 Modify `finish_streaming_response` call

**Location**: Lines 733-737

**Before**:
```rust
let mut ctx = context.write().await;
// finish_streaming_response already handles state transitions:
// StreamingLLMResponse -> ProcessingLLMResponse -> Idle
let _ = ctx.finish_streaming_response(message_id);
log::info!("FSM: Finished streaming response");
```

**After**:
```rust
let mut ctx = context.write().await;
// Use new Phase 1.5 API
// TODO: Extract usage info from LLM response
let finalized = ctx.finalize_streaming_response(
    message_id,
    Some("stop".to_string()),  // normal completion
    None                        // TODO: add usage
);
log::info!("FSM: Finished streaming response (finalized: {})", finalized);
```

---

### Phase 2: Migrate Other Services

Check and migrate other files using the old API:

```bash
# Find all files using old API
grep -r "begin_streaming_response\|apply_streaming_delta\|finish_streaming_response\|abort_streaming_response" \
  crates/web_service/src/services/
```

---

### Phase 3: Deprecate Old API

Mark old API as deprecated in `context_manager/src/structs/context_lifecycle.rs`:

```rust
#[deprecated(
    since = "0.2.0",
    note = "Use begin_streaming_llm_response instead. This method does not support rich message types."
)]
pub fn begin_streaming_response(&mut self) -> (Uuid, Vec<ContextUpdate>) {
    // ...
}

#[deprecated(
    since = "0.2.0",
    note = "Use append_streaming_chunk instead. This method does not track sequence numbers."
)]
pub fn apply_streaming_delta<S>(
    &mut self,
    message_id: Uuid,
    delta: S,
) -> Option<(ContextUpdate, u64)>
where
    S: Into<String>,
{
    // ...
}

#[deprecated(
    since = "0.2.0",
    note = "Use finalize_streaming_response instead. This method does not save metadata."
)]
pub fn finish_streaming_response(&mut self, message_id: Uuid) -> Vec<ContextUpdate> {
    // ...
}

#[deprecated(
    since = "0.2.0",
    note = "Use finalize_streaming_response with error finish_reason instead."
)]
pub fn abort_streaming_response<S>(&mut self, message_id: Uuid, error: S) -> Vec<ContextUpdate>
where
    S: Into<String>,
{
    // ...
}
```

---

### Phase 4: Remove Old API

Completely remove these deprecated methods in v0.3.0.

---

## New API Advantages

### 1. Signal-Pull Architecture Support

The new API's `StreamingResponse` message type supports:
- ✅ Sequence number tracking (`StreamChunk.sequence`)
- ✅ Incremental content pulling (`get_streaming_chunks_after`)
- ✅ Frontend self-healing mechanism

### 2. Rich Message Types

The new API uses `RichMessageType::StreamingResponse`, containing:
- ✅ Complete chunks history
- ✅ Timestamp and duration statistics
- ✅ Model information and usage statistics
- ✅ Interval time for each chunk

### 3. Metadata Completeness

The new API automatically saves to `MessageMetadata.streaming`:
- ✅ `chunks_count`
- ✅ `started_at` / `completed_at`
- ✅ `total_duration_ms`
- ✅ `average_chunk_interval_ms`

---

## Testing Verification

Scenarios to verify after migration:

### 1. Normal Streaming Response
- [ ] LLM streaming response fully received
- [ ] Sequence numbers increment correctly
- [ ] Metadata saved correctly
- [ ] State transitions correct

### 2. Error Handling
- [ ] Correctly finalizes on streaming interruption
- [ ] Error information recorded in finish_reason
- [ ] State correctly returns to Idle

### 3. Tool Calls
- [ ] Correctly parses when streaming response contains tool calls
- [ ] Agent loop triggers normally

### 4. Storage Persistence
- [ ] StreamingResponse messages saved correctly
- [ ] Chunks complete after loading from storage
- [ ] Metadata fully saved

---

## Timeline

| Phase | Task | Estimated Time | Status |
|------|------|----------|------|
| Phase 1 | Migrate chat_service.rs | 1-2 hours | 📅 Pending |
| Phase 2 | Migrate other services | 1 hour | 📅 Pending |
| Phase 3 | Mark old API as deprecated | 30 minutes | 📅 Pending |
| Phase 4 | Testing verification | 1 hour | 📅 Pending |
| Phase 5 | Remove old API (v0.3.0) | - | 🔜 Planned |

---

## Compatibility Notes

### Backward Compatibility

- ✅ Retain old API during migration
- ✅ Add deprecation warnings
- ✅ Give users enough migration time

### Breaking Changes

When removing old API in v0.3.0:
- ❌ `begin_streaming_response()` will be removed
- ❌ `apply_streaming_delta()` will be removed
- ❌ `finish_streaming_response()` will be removed
- ❌ `abort_streaming_response()` will be removed

**Migration Path**: See Phase 1 section of this document

---

## Reference Resources

- [Phase 1.5 Completion Summary](openspec/changes/refactor-context-session-architecture/PHASE_1.5_COMPLETION_SUMMARY.md)
- [Signal-Pull Architecture Specification](openspec/changes/refactor-context-session-architecture/specs/sync/spec.md)
- [Streaming Tests](crates/context_manager/tests/streaming_tests.rs)
- [Integration Tests](crates/web_service/tests/signal_pull_integration_tests.rs)

---

**Status**: 📋 **Optional Architecture Upgrade**
**Priority**: 🔵 **Low-Medium** - Existing API works normally, new API provides additional features
**Recommendation**: Decide whether to upgrade based on requirements. Consider migration if you need Signal-Pull's sequence number tracking and incremental pull features

