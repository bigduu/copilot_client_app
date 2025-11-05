# Implementation Tasks

## 1. Core Session Manager Refactor

- [ ] 1.1 Change `ChatSessionManager` cache type from `Mutex<LruCache<Uuid, Arc<Mutex<ChatContext>>>>` to `Mutex<LruCache<Uuid, Arc<RwLock<ChatContext>>>>`
- [ ] 1.2 Update `create_session` to use `RwLock::new()` instead of `Mutex::new()`
- [ ] 1.3 Refactor `load_context` to return `Arc<RwLock<ChatContext>>`
- [ ] 1.4 Optimize cache lock acquisitions (single lock per operation, no multiple locks)
- [ ] 1.5 Add inline comments documenting lock ordering rules

## 2. Context Controller Read Endpoints

- [ ] 2.1 Update `get_context` to use `context.read().await` and extract DTO in minimal scope
- [ ] 2.2 Update `get_context_messages` to use `context.read().await` for message extraction
- [ ] 2.3 Update `get_context_state` to use `context.read().await` for state reading
- [ ] 2.4 Update `list_contexts` if it loads full contexts (currently returns summaries)

## 3. Context Controller Write Endpoints

- [ ] 3.1 Update `create_context` to use `context.write().await` for system_prompt attachment
- [ ] 3.2 Update `update_context` to use `context.write().await` for modifications
- [ ] 3.3 Update `add_context_message` to use `context.write().await` for message addition
- [ ] 3.4 Update `approve_context_tools` to use `context.write().await` for tool approval
- [ ] 3.5 Update `send_message_action` to coordinate with FSM (read after processing)
- [ ] 3.6 Update `approve_tools_action` to coordinate with FSM (read after processing)

## 4. DTO Optimization

- [ ] 4.1 Locate `ChatContextDTO::from` implementation (likely in dto.rs or similar)
- [ ] 4.2 Change signature from `From<ChatContext>` to accept `&ChatContext`
- [ ] 4.3 Update implementation to read from reference instead of owned value
- [ ] 4.4 Verify serde serialization works correctly with borrowed data
- [ ] 4.5 Update all call sites to pass `&*ctx` instead of `ctx.clone()`

## 5. FSM Integration

- [ ] 5.1 Review `chat_service.rs` for context lock usage patterns
- [ ] 5.2 Update FSM to use `write().await` when modifying context
- [ ] 5.3 Ensure FSM releases locks between state transitions if possible
- [ ] 5.4 Verify auto-save mechanism works with RwLock

## 6. Testing & Validation

- [ ] 6.1 Compile and fix all type errors
- [ ] 6.2 Run existing unit tests for session_manager
- [ ] 6.3 Run existing integration tests for context API
- [ ] 6.4 Manual concurrent testing: multiple simultaneous GET requests
- [ ] 6.5 Manual concurrent testing: GET during POST operations
- [ ] 6.6 Verify no deadlocks under load
- [ ] 6.7 Benchmark: measure improvement in concurrent read throughput
- [ ] 6.8 Verify memory usage hasn't increased significantly

## 7. Documentation

- [ ] 7.1 Add inline comments documenting RwLock usage patterns
- [ ] 7.2 Document lock ordering rules in session_manager.rs
- [ ] 7.3 Update any existing architecture docs about locking strategy
- [ ] 7.4 Add performance notes about when to use read vs write locks

## 8. Cleanup

- [ ] 8.1 Remove any temporary debugging code
- [ ] 8.2 Ensure all lock scopes are minimal (use explicit blocks `{}`)
- [ ] 8.3 Run `cargo clippy` and address any new warnings
- [ ] 8.4 Run `cargo fmt` for consistent formatting
