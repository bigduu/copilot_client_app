# RwLock Concurrency Design

## Context

The backend uses an in-memory cache (`LruCache`) of `ChatContext` objects wrapped in `Arc<Mutex<ChatContext>>`. Current architecture:

```rust
pub struct ChatSessionManager<T> {
    cache: Mutex<LruCache<Uuid, Arc<Mutex<ChatContext>>>>,
    storage: Arc<T>,
}
```

**Current Problems:**

1. **Mutex serializes all access** - Even read-only operations (GET endpoints) acquire exclusive locks
2. **Expensive cloning** - `ChatContextDTO::from(ctx.clone())` copies entire `message_pool: HashMap<Uuid, MessageNode>`
3. **Lock held during clone** - Clone happens while holding the Mutex, blocking other requests
4. **No read concurrency** - 10 concurrent GET requests process sequentially instead of in parallel

**Data Structure:**

```rust
pub struct ChatContext {
    pub message_pool: HashMap<Uuid, MessageNode>,  // Can be large (100s of messages)
    pub branches: HashMap<String, Branch>,
    // ... other fields
}

pub struct Branch {
    pub message_ids: Vec<Uuid>,  // Just references to message_pool
}
```

## Goals / Non-Goals

**Goals:**

- Allow concurrent read operations on the same context
- Eliminate unnecessary data cloning in read paths
- Maintain data consistency for write operations
- Preserve existing external API contracts

**Non-Goals:**

- Fine-grained locking within ChatContext (future optimization)
- Message-level reference counting with Arc (future optimization)
- Change external REST API structure
- Modify data persistence format

## Decisions

### Decision 1: Use RwLock instead of Mutex

**Choice:** `Arc<RwLock<ChatContext>>`

**Rationale:**

- Read operations (GET requests) are far more frequent than writes
- Multiple readers can proceed concurrently without blocking
- RwLock has minimal overhead for the uncontended case
- Tokio's RwLock is well-tested and async-aware

**Alternatives considered:**

- **Arc<Mutex> with manual cloning**: Current approach, too slow
- **Message-level Arc wrapping**: More complex, premature optimization
- **Lock-free structures**: Overkill for current scale, complex to maintain

### Decision 2: Optimize DTO Conversion to Use References

**Choice:** Change `ChatContextDTO::from(ChatContext)` to `ChatContextDTO::from(&ChatContext)`

**Rationale:**

- DTO only needs to read data, not own it
- Serialization can work directly from references
- Eliminates the largest source of allocations

**Implementation:**

```rust
// Before
let dto = ChatContextDTO::from(ctx.clone());  // Clones entire message_pool

// After
let dto = ChatContextDTO::from(&*ctx);  // Just references data
```

### Decision 3: Read/Write Access Patterns

**Read-only endpoints** (use `read().await`):

- `GET /contexts` - list contexts
- `GET /contexts/{id}` - get context details
- `GET /contexts/{id}/messages` - get messages
- `GET /contexts/{id}/state` - get current state

**Write endpoints** (use `write().await`):

- `POST /contexts` - create context
- `PUT /contexts/{id}` - update context
- `POST /contexts/{id}/messages` - add message
- `POST /contexts/{id}/actions/*` - FSM actions
- `DELETE /contexts/{id}` - delete context

### Decision 4: Lock Acquisition Pattern

**Pattern:**

```rust
// Read operation
let data = {
    let ctx = context.read().await;
    extract_only_needed_data(&ctx)
}; // Lock released
process_and_return(data)

// Write operation
{
    let mut ctx = context.write().await;
    ctx.modify();
    save_if_needed(&ctx).await?;
} // Lock released
```

**Rationale:**

- Minimize lock hold time
- Extract data in a block, release lock before expensive operations (JSON serialization)
- Keep lock scopes explicit and visible

## Risks / Trade-offs

### Risk 1: Read Starvation

**Risk:** Writers could be blocked if readers continuously hold locks

**Mitigation:**

- Read operations are short-lived (just data extraction)
- RwLock implementations typically favor writers to prevent starvation
- Monitor lock contention metrics in production

### Risk 2: Deadlocks with Nested Locks

**Risk:** Code that acquires cache lock then context lock could deadlock

**Mitigation:**

- Establish lock ordering: always acquire cache lock first, then context lock
- Document lock ordering in code comments
- Use lock guards in minimal scopes (no lock held across await points except storage I/O)

### Risk 3: Increased Memory Usage

**Risk:** Multiple readers keep context in memory simultaneously

**Mitigation:**

- Context already in memory (LRU cache)
- Read locks don't prevent other reads, only writes
- LRU eviction still works (only affects write acquisition)

## Migration Plan

### Phase 1: Update Core Types (1 session)

1. Change `ChatSessionManager` to use `RwLock`
2. Update `create_session` and `load_context` methods
3. Fix compilation errors in session_manager.rs

### Phase 2: Update Controllers (1 session)

1. Refactor all endpoints in `context_controller.rs`
2. Use `read().await` for GET endpoints
3. Use `write().await` for POST/PUT/DELETE endpoints
4. Ensure minimal lock scopes

### Phase 3: Optimize DTO (1 session)

1. Change `ChatContextDTO::from` signature
2. Update all call sites to pass references
3. Verify no clones in hot paths

### Phase 4: Testing & Validation

1. Run existing endpoint tests
2. Concurrent load testing (multiple simultaneous requests)
3. Verify performance improvements
4. Monitor lock contention

### Rollback Plan

- All changes are internal, no data format changes
- Git revert if severe issues found
- No backward compatibility concerns (internal refactor)

## Open Questions

1. **Q:** Should we add lock contention metrics/logging?
   **A:** Not initially, add if needed based on production behavior

2. **Q:** Do we need separate read/write pools in SessionManager?
   **A:** No, single LRU cache is sufficient for now

3. **Q:** Should messages in message_pool be Arc-wrapped?
   **A:** Future optimization, not needed for this change
