# Refactor Context Locking to RwLock for Concurrent Read Performance

## Why

Current implementation uses `Arc<Mutex<ChatContext>>` which causes read operations (GET requests) to block all other operations, creating a bottleneck. Additionally, every endpoint clones the entire `ChatContext` including the full `message_pool` HashMap, causing significant performance degradation when contexts contain many messages.

**Performance Impact:**
- With 100 messages (~1KB each), every API call clones ~100KB of data while holding a lock
- Multiple concurrent GET requests block each other unnecessarily
- Message retrieval endpoint is particularly slow as it must extract messages from the pool while holding an exclusive lock

## What Changes

- **BREAKING**: Replace `Arc<Mutex<ChatContext>>` with `Arc<RwLock<ChatContext>>` throughout the backend
- Refactor `ChatContextDTO::from()` to accept `&ChatContext` reference instead of owned value (no more cloning)
- Update all read-only endpoints to use `read().await` (GET requests)
- Update all write endpoints to use `write().await` (POST/PUT/DELETE requests)
- Optimize DTO conversion to extract only necessary data without cloning the entire context

**Benefits:**
- Multiple concurrent read operations can proceed in parallel
- Eliminates expensive clone operations on every API call
- Reduced memory allocation and GC pressure
- Better scalability for applications with many concurrent users

## Impact

**Affected specs:**
- `backend-session-management` (NEW) - defines session/context locking behavior
- `backend-context-api` (NEW) - defines REST API behavior for context operations

**Affected code:**
- `crates/web_service/src/services/session_manager.rs` - Change `Mutex` to `RwLock`, update all lock acquisition
- `crates/web_service/src/controllers/context_controller.rs` - Update all endpoints to use `read()/write()`
- `crates/web_service/src/dto.rs` - Optimize `ChatContextDTO::from()` to work with references
- `crates/web_service/src/services/chat_service.rs` - Update FSM interaction with contexts

**Breaking Changes:**
- Session manager API changes from `.lock().await` to `.read().await` or `.write().await`
- DTO conversion signature changes (internal only, no external API impact)

**Migration:**
- No data migration required
- No external API changes
- Internal refactor only, transparent to frontend

