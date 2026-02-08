# System Prompt Persistence - Implementation Status

## Completed Work ✅

### 1. Data Structure Definition (100%)

**File**: `crates/context_manager/src/structs/system_prompt_snapshot.rs`

- ✅ `SystemPromptSnapshot` - Main snapshot structure
- ✅ `PromptSource` - Prompt source enumeration
- ✅ `PromptFragmentInfo` - Fragment information (optional)
- ✅ `PromptStats` - Statistics information
- ✅ Helper methods and unit tests

**Features**:
- Includes version number, timestamp, context ID
- Records agent role and tool list
- Supports serialization/deserialization
- Contains complete enhanced system prompt

### 2. Storage Interface Extension (100%)

**File**: `crates/web_service/src/storage/provider.rs`

- ✅ `save_system_prompt_snapshot()` - Save snapshot
- ✅ `load_system_prompt_snapshot()` - Load snapshot

**Changes**:
```rust
/// Save system prompt snapshot for debugging and tracing
async fn save_system_prompt_snapshot(
    &self,
    context_id: Uuid,
    snapshot: &SystemPromptSnapshot,
) -> Result<()>;

/// Load the latest system prompt snapshot
async fn load_system_prompt_snapshot(
    &self,
    context_id: Uuid,
) -> Result<Option<SystemPromptSnapshot>>;
```

## Pending Work ⏳

### 3. MessagePoolStorageProvider Implementation (0%)

**File**: `crates/web_service/src/storage/message_pool_provider.rs`

**To Add**:

```rust
#[async_trait]
impl StorageProvider for MessagePoolStorageProvider {
    // ... existing methods ...

    async fn save_system_prompt_snapshot(
        &self,
        context_id: Uuid,
        snapshot: &SystemPromptSnapshot,
    ) -> Result<()> {
        let context_dir = self.get_context_dir(context_id);
        let snapshot_path = context_dir.join("system_prompt.json");

        // Serialize and write to file
        let json = serde_json::to_string_pretty(snapshot)
            .map_err(|e| AppError::SerializationError(e.to_string()))?;

        tokio::fs::write(&snapshot_path, json)
            .await
            .map_err(|e| AppError::IoError(e.to_string()))?;

        tracing::debug!(
            context_id = %context_id,
            version = snapshot.version,
            "Saved system prompt snapshot"
        );

        Ok(())
    }

    async fn load_system_prompt_snapshot(
        &self,
        context_id: Uuid,
    ) -> Result<Option<SystemPromptSnapshot>> {
        let context_dir = self.get_context_dir(context_id);
        let snapshot_path = context_dir.join("system_prompt.json");

        if !snapshot_path.exists() {
            return Ok(None);
        }

        let json = tokio::fs::read_to_string(&snapshot_path)
            .await
            .map_err(|e| AppError::IoError(e.to_string()))?;

        let snapshot: SystemPromptSnapshot = serde_json::from_str(&json)
            .map_err(|e| AppError::SerializationError(e.to_string()))?;

        Ok(Some(snapshot))
    }
}
```

**Estimated Time**: 30 minutes

### 4. MemoryStorageProvider Implementation (0%)

**File**: `crates/web_service/src/storage/memory_provider.rs`

**To Add**:

```rust
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct MemoryStorageProvider {
    contexts: Arc<RwLock<HashMap<Uuid, ChatContext>>>,
    snapshots: Arc<RwLock<HashMap<Uuid, SystemPromptSnapshot>>>, // New
}

impl MemoryStorageProvider {
    pub fn new() -> Self {
        Self {
            contexts: Arc::new(RwLock::new(HashMap::new())),
            snapshots: Arc::new(RwLock::new(HashMap::new())), // New
        }
    }
}

#[async_trait]
impl StorageProvider for MemoryStorageProvider {
    // ... existing methods ...

    async fn save_system_prompt_snapshot(
        &self,
        context_id: Uuid,
        snapshot: &SystemPromptSnapshot,
    ) -> Result<()> {
        let mut snapshots = self.snapshots.write().await;
        snapshots.insert(context_id, snapshot.clone());
        Ok(())
    }

    async fn load_system_prompt_snapshot(
        &self,
        context_id: Uuid,
    ) -> Result<Option<SystemPromptSnapshot>> {
        let snapshots = self.snapshots.read().await;
        Ok(snapshots.get(&context_id).cloned())
    }
}
```

**Estimated Time**: 15 minutes

### 5. LlmRequestBuilder Integration (0%)

**File**: `crates/web_service/src/services/llm_request_builder.rs`

**Required Changes**:

1. Add imports:
```rust
use context_manager::structs::system_prompt_snapshot::{
    SystemPromptSnapshot, PromptSource, PromptStats
};
use chrono::Utc;
```

2. Modify `build()` method signature and implementation:
```rust
pub async fn build(
    &self,
    context: &Arc<RwLock<ChatContext>>,
    storage: &Arc<dyn StorageProvider>, // New parameter
) -> Result<BuiltLlmRequest, AppError> {
    let prepared = {
        let mut context_lock = context.write().await;
        context_lock.prepare_llm_request_async().await
    };

    // ... existing system prompt processing logic ...

    // Generate and save snapshot
    if let Some(ref enhanced) = prepared.enhanced_system_prompt {
        let snapshot = self.create_snapshot(
            &context.read().await,
            &prepared,
            enhanced,
        ).await;

        // Save asynchronously without blocking main flow
        let storage_clone = storage.clone();
        let snapshot_clone = snapshot.clone();
        tokio::spawn(async move {
            if let Err(e) = storage_clone
                .save_system_prompt_snapshot(snapshot_clone.context_id, &snapshot_clone)
                .await
            {
                log::warn!("Failed to save system prompt snapshot: {:?}", e);
            }
        });
    }

    // ... remaining code ...
}
```

3. Add helper method:
```rust
impl LlmRequestBuilder {
    async fn create_snapshot(
        &self,
        context: &ChatContext,
        prepared: &PreparedLlmRequest,
        enhanced_prompt: &str,
    ) -> SystemPromptSnapshot {
        // Get version number (using simple increment for now)
        let version = 1; // TODO: Implement version management

        // Determine prompt source
        let base_prompt_source = if prepared.branch_system_prompt.is_some() {
            PromptSource::Branch {
                branch_name: prepared.branch_name.clone(),
            }
        } else if let Some(ref id) = prepared.system_prompt_id {
            PromptSource::Service {
                prompt_id: id.clone(),
            }
        } else {
            PromptSource::Default
        };

        // Collect tool list
        let available_tools: Vec<String> = prepared
            .available_tools
            .iter()
            .map(|t| t.name.clone())
            .collect();

        SystemPromptSnapshot::new(
            version,
            context.id,
            context.config.agent_role.clone(),
            base_prompt_source,
            enhanced_prompt.to_string(),
            available_tools,
        )
    }
}
```

**Estimated Time**: 45 minutes

### 6. Update ChatService Call (0%)

**File**: `crates/web_service/src/services/chat_service.rs`

**Required Changes**:

```rust
impl<T: StorageProvider + 'static> ChatService<T> {
    async fn send_to_llm(
        &mut self,
        context: &Arc<RwLock<ChatContext>>,
    ) -> Result<...> {
        // Get storage reference
        let storage = self.session_manager.storage.clone();

        // Pass storage when building request
        let built_request = self.llm_request_builder
            .build(context, &storage) // Add storage parameter
            .await?;

        // ... remaining code ...
    }
}
```

**Note**: Need to expose `storage` field in `ChatSessionManager`.

**Estimated Time**: 15 minutes

### 7. Add SessionManager Storage Accessor (0%)

**File**: `crates/web_service/src/services/session_manager.rs`

**To Add**:

```rust
impl<T: StorageProvider> ChatSessionManager<T> {
    // ... existing methods ...

    /// Get a reference to the storage provider
    pub fn storage(&self) -> &Arc<T> {
        &self.storage
    }
}
```

**Estimated Time**: 5 minutes

## Test Plan

### Unit Tests

1. **SystemPromptSnapshot Tests** ✅
   - Implemented in `system_prompt_snapshot.rs`
   - Test serialization/deserialization
   - Test creation and preview

2. **Storage Tests** ⏳
   - Test save and load snapshot
   - Test non-existent snapshot returns None
   - Test serialization error handling

### Integration Tests

1. **End-to-End Tests** ⏳
   - Create context
   - Send message
   - Verify `system_prompt.json` file creation
   - Verify content correctness

2. **Version Tests** ⏳
   - Send multiple messages
   - Verify version number increments

## Total Remaining Work Time Estimate

- MessagePoolStorageProvider implementation: 30 minutes
- MemoryStorageProvider implementation: 15 minutes
- LlmRequestBuilder integration: 45 minutes
- ChatService update: 15 minutes
- SessionManager accessor: 5 minutes
- Testing: 30 minutes

**Total**: Approximately 2.5 hours

## Next Steps Recommendations

### Option 1: Continue Implementation
Complete remaining steps 3-7 in the order above.

### Option 2: Minimal Validation
Only implement MessagePoolStorageProvider and LlmRequestBuilder integration to quickly validate functionality.

### Option 3: Phased Approach
1. Complete storage implementation first (steps 3-4)
2. Test storage functionality
3. Then integrate into LlmRequestBuilder (steps 5-7)

## Created Files

1. ✅ `/crates/context_manager/src/structs/system_prompt_snapshot.rs` - Data structure
2. ✅ `/docs/architecture/SYSTEM_PROMPT_PERSISTENCE_DESIGN.md` - Design document
3. ✅ `/docs/architecture/SYSTEM_PROMPT_IMPLEMENTATION_STATUS.md` - This document

## Dependencies

```
SystemPromptSnapshot (completed)
    ↓
StorageProvider trait (completed)
    ↓
MessagePoolStorageProvider impl (pending)
    ↓
LlmRequestBuilder integration (pending)
    ↓
ChatService update (pending)
    ↓
Testing validation (pending)
```

## Verification Checklist

After completion, verify:

- [ ] `data/contexts/{context_id}/system_prompt.json` file created
- [ ] JSON format is correct and readable
- [ ] `enhanced_prompt` field contains complete content
- [ ] `available_tools` list is correct
- [ ] Version number increments correctly
- [ ] Timestamp is accurate
- [ ] Agent role is correctly recorded
- [ ] Does not affect existing functionality (save failure does not block)

## Usage Examples

After completion, you can:

```bash
# After sending a message
cat data/contexts/091a3d54-f001-4d1e-b0f8-2d152c5ba7d5/system_prompt.json

# View complete system prompt
jq '.enhanced_prompt' system_prompt.json

# View tool list
jq '.available_tools' system_prompt.json

# View statistics
jq '.stats' system_prompt.json
```
