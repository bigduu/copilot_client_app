# Context Lifecycle Refactoring Plan

## Overview
Splitting `context_lifecycle.rs` (965 lines) into organized folder-based modules.

## Target Structure
```
crates/context_manager/src/structs/context_lifecycle/
├── mod.rs              (~50 lines)  - Module exports and re-exports
├── state.rs            (~250 lines) - State management & FSM transitions
├── streaming.rs        (~350 lines) - Streaming response handling
├── auto_loop.rs        (~150 lines) - Auto-loop management
└── pipeline.rs         (~165 lines) - Message pipeline processing
```

## Module Breakdown

### 1. **state.rs** - State Management & FSM Transitions (~250 lines)
**Purpose**: Handle context state, dirty flags, trace IDs, and FSM transitions

**Methods**:
- `mark_dirty()` - Mark context as needing save
- `clear_dirty()` - Clear dirty flag after save
- `is_dirty()` - Check if context needs saving
- `set_trace_id()` - Set trace ID for debugging
- `get_trace_id()` - Get current trace ID
- `clear_trace_id()` - Clear trace ID
- `transition_to_awaiting_llm()` - FSM transition before LLM request
- `handle_llm_error()` - Handle LLM errors and transition to Failed
- `record_tool_approval_request()` - Record tool approval request
- `record_tool_calls_denied()` - Record when tools are denied
- `begin_tool_execution()` - Start tool execution phase
- `record_tool_execution_failure()` - Record tool execution failure
- `complete_tool_execution()` - Complete tool execution

### 2. **streaming.rs** - Streaming Response Handling (~350 lines)
**Purpose**: Manage streaming LLM responses with chunk tracking

**Methods**:
- `begin_streaming_llm_response()` - Start new streaming response
- `append_streaming_chunk()` - Add chunk to streaming response
- `finalize_streaming_response()` - Finalize and calculate stats
- `abort_streaming_response()` - Abort streaming on error
- `get_streaming_sequence()` - Get current sequence number
- `get_streaming_chunks_after()` - Get chunks for incremental pull
- `ensure_sequence_at_least()` - Ensure minimum sequence number
- `message_sequence()` - Get message sequence number
- `message_text_snapshot()` - Get message text snapshot
- `message_content_slice()` - Get sliced message content

### 3. **auto_loop.rs** - Auto-Loop Management (~150 lines)
**Purpose**: Manage automatic tool execution loops

**Methods**:
- `begin_auto_loop()` - Start auto-loop with depth tracking
- `record_auto_loop_progress()` - Record loop iteration progress
- `complete_auto_loop()` - Complete auto-loop successfully
- `should_continue_auto_loop()` - Check if loop should continue
- `cancel_auto_loop()` - Cancel auto-loop with reason

### 4. **pipeline.rs** - Message Pipeline Processing (~165 lines)
**Purpose**: Message pipeline building and processing

**Methods**:
- `send_message()` - Legacy message sending
- `build_message_pipeline()` - Build configured pipeline
- `process_message_with_pipeline()` - Process message through pipeline
- `append_text_message_with_metadata()` - Append text message with metadata

### 5. **mod.rs** - Module Exports (~50 lines)
**Purpose**: Re-export all functionality, maintain public API

**Structure**:
```rust
//! Context lifecycle management
//!
//! This module contains all lifecycle-related methods for ChatContext,
//! organized by responsibility:
//!
//! - `state`: State management and FSM transitions
//! - `streaming`: Streaming response handling
//! - `auto_loop`: Automatic tool execution loops
//! - `pipeline`: Message pipeline processing

mod state;
mod streaming;
mod auto_loop;
mod pipeline;

// Re-export all public items
pub use state::*;
pub use streaming::*;
pub use auto_loop::*;
pub use pipeline::*;
```

## Migration Steps

1. ✅ Create `context_lifecycle/` directory
2. ⏳ Create `state.rs` with state management methods
3. ⏳ Create `streaming.rs` with streaming methods
4. ⏳ Create `auto_loop.rs` with auto-loop methods
5. ⏳ Create `pipeline.rs` with pipeline methods
6. ⏳ Create `mod.rs` with re-exports
7. ⏳ Update `structs/mod.rs` to use new module
8. ⏳ Delete old `context_lifecycle.rs`
9. ⏳ Run tests to verify
10. ⏳ Update documentation

## Benefits

### Code Organization
- ✅ **Clear separation of concerns** - Each module has single responsibility
- ✅ **Easy navigation** - Find methods by logical grouping
- ✅ **Reduced cognitive load** - Smaller files are easier to understand

### Maintainability
- ✅ **Easier to test** - Test modules independently
- ✅ **Simpler to extend** - Add methods to appropriate module
- ✅ **Better code reviews** - Review changes in context

### Performance
- ✅ **Faster compilation** - Parallel compilation of smaller modules
- ✅ **Better IDE performance** - Smaller files load faster

## Success Criteria
- [x] All 965 lines split into ~5 focused modules
- [ ] All tests passing
- [ ] No functionality lost
- [ ] Clean module boundaries
- [ ] Clear, documented public API
