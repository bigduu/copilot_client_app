# System Prompt Persistence Design

## Goals

Save the last used enhanced system prompt for each context to `system_prompt.json` for debugging and tracing purposes.

## Motivation

1. **Traceability** - Developers can see the complete system prompt actually received by the AI
2. **Debugging Friendly** - Quickly locate prompt-related issues
3. **Version Comparison** - Compare changes between different prompt versions
4. **Transparency** - Understand how tool definitions, role permissions, etc. are injected into the prompt

## Design

### File Structure

```
data/contexts/{context_id}/
├── context.json           # Existing: context metadata and configuration
├── system_prompt.json     # New: snapshot of last used system prompt
└── messages/              # Existing: message pool
    ├── {message_id}.json
    └── ...
```

### Data Structure

```rust
/// System Prompt Snapshot - saved to system_prompt.json
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SystemPromptSnapshot {
    /// Snapshot version (increments on each update)
    pub version: u64,

    /// Generation timestamp
    pub generated_at: DateTime<Utc>,

    /// Context ID
    pub context_id: Uuid,

    /// Current agent role
    pub agent_role: AgentRole,

    /// Base prompt source
    pub base_prompt_source: PromptSource,

    /// Final enhanced system prompt (complete content sent to LLM)
    pub enhanced_prompt: String,

    /// Prompt fragment details (optional, for debugging)
    pub fragments: Option<Vec<PromptFragmentInfo>>,

    /// Available tools list (tool names)
    pub available_tools: Vec<String>,

    /// Statistics
    pub stats: PromptStats,
}

/// Prompt source
#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum PromptSource {
    /// Loaded from SystemPromptService
    Service { prompt_id: String },
    /// Branch custom prompt
    Branch { branch_name: String },
    /// Default prompt
    Default,
}

/// Prompt fragment information (for debugging)
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PromptFragmentInfo {
    pub source: String,      // e.g., "tool_enhancement", "role_context"
    pub priority: u8,
    pub length: usize,
    pub preview: String,     // First 100 characters preview
}

/// Statistics
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PromptStats {
    pub total_length: usize,
    pub fragment_count: usize,
    pub tool_count: usize,
    pub enhancement_time_ms: u64,
}
```

### Implementation Steps

#### Step 1: Create Data Structure (context_manager)

**File**: `crates/context_manager/src/structs/system_prompt_snapshot.rs`

```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::structs::context_agent::AgentRole;

// ... structures defined above
```

**File**: `crates/context_manager/src/structs/mod.rs`

```rust
pub mod system_prompt_snapshot;
pub use system_prompt_snapshot::*;
```

#### Step 2: Extend Storage Interface

**File**: `crates/web_service/src/storage/provider.rs`

```rust
#[async_trait]
pub trait StorageProvider: Send + Sync {
    // ... existing methods

    /// Save system prompt snapshot
    async fn save_system_prompt_snapshot(
        &self,
        context_id: Uuid,
        snapshot: &SystemPromptSnapshot,
    ) -> Result<(), String>;

    /// Load latest system prompt snapshot
    async fn load_system_prompt_snapshot(
        &self,
        context_id: Uuid,
    ) -> Result<Option<SystemPromptSnapshot>, String>;
}
```

#### Step 3: Implement Storage Logic

**File**: `crates/web_service/src/storage/message_pool_provider.rs`

```rust
impl StorageProvider for MessagePoolStorageProvider {
    // ... existing methods

    async fn save_system_prompt_snapshot(
        &self,
        context_id: Uuid,
        snapshot: &SystemPromptSnapshot,
    ) -> Result<(), String> {
        let context_dir = self.get_context_dir(context_id);
        let snapshot_path = context_dir.join("system_prompt.json");

        let json = serde_json::to_string_pretty(snapshot)
            .map_err(|e| format!("Failed to serialize snapshot: {}", e))?;

        tokio::fs::write(&snapshot_path, json)
            .await
            .map_err(|e| format!("Failed to write snapshot: {}", e))?;

        debug!(
            context_id = %context_id,
            version = snapshot.version,
            "Saved system prompt snapshot"
        );

        Ok(())
    }

    async fn load_system_prompt_snapshot(
        &self,
        context_id: Uuid,
    ) -> Result<Option<SystemPromptSnapshot>, String> {
        let context_dir = self.get_context_dir(context_id);
        let snapshot_path = context_dir.join("system_prompt.json");

        if !snapshot_path.exists() {
            return Ok(None);
        }

        let json = tokio::fs::read_to_string(&snapshot_path)
            .await
            .map_err(|e| format!("Failed to read snapshot: {}", e))?;

        let snapshot: SystemPromptSnapshot = serde_json::from_str(&json)
            .map_err(|e| format!("Failed to deserialize snapshot: {}", e))?;

        Ok(Some(snapshot))
    }
}
```

#### Step 4: Generate and Save Snapshot in LlmRequestBuilder

**File**: `crates/web_service/src/services/llm_request_builder.rs`

```rust
use context_manager::{SystemPromptSnapshot, PromptSource, PromptStats};
use chrono::Utc;

impl LlmRequestBuilder {
    pub async fn build(
        &self,
        context: &Arc<RwLock<ChatContext>>,
        storage: &Arc<dyn StorageProvider>, // New parameter
    ) -> Result<BuiltLlmRequest, AppError> {
        // ... existing code

        // Generate system prompt snapshot
        if let Some(ref enhanced) = prepared.enhanced_system_prompt {
            let snapshot = self.create_prompt_snapshot(
                &context.read().await,
                &prepared,
                enhanced,
            ).await;

            // Save snapshot
            if let Err(e) = storage
                .save_system_prompt_snapshot(prepared.context_id, &snapshot)
                .await
            {
                log::warn!(
                    "Failed to save system prompt snapshot: {}",
                    e
                );
                // Don't block main flow
            }
        }

        // ... existing code
    }

    async fn create_prompt_snapshot(
        &self,
        context: &ChatContext,
        prepared: &PreparedLlmRequest,
        enhanced_prompt: &str,
    ) -> SystemPromptSnapshot {
        // Get or increment version number
        let version = self.get_next_version(context.id).await;

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

        // Collect tools list
        let available_tools: Vec<String> = prepared
            .available_tools
            .iter()
            .map(|t| t.name.clone())
            .collect();

        SystemPromptSnapshot {
            version,
            generated_at: Utc::now(),
            context_id: context.id,
            agent_role: context.config.agent_role.clone(),
            base_prompt_source,
            enhanced_prompt: enhanced_prompt.to_string(),
            fragments: None, // Can add detailed fragment info later
            available_tools,
            stats: PromptStats {
                total_length: enhanced_prompt.len(),
                fragment_count: 0, // Needs to be obtained from Pipeline
                tool_count: prepared.available_tools.len(),
                enhancement_time_ms: 0, // Can add timing
            },
        }
    }

    // Version management (can use in-memory cache or read from file)
    async fn get_next_version(&self, context_id: Uuid) -> u64 {
        // Simple implementation: read version from existing snapshot + 1
        // Or use AtomicU64 for in-memory maintenance
        1 // Temporary return
    }
}
```

#### Step 5: Update ChatService Call

**File**: `crates/web_service/src/services/chat_service.rs`

```rust
impl<T: StorageProvider + 'static> ChatService<T> {
    async fn send_to_llm(&mut self, context: &Arc<RwLock<ChatContext>>) -> Result<...> {
        // Pass storage when building request
        let built_request = self.llm_request_builder
            .build(context, &self.session_manager.storage)
            .await?;

        // ... remaining code
    }
}
```

### Snapshot Example

```json
{
  "version": 42,
  "generated_at": "2025-11-19T01:15:30.123Z",
  "context_id": "091a3d54-f001-4d1e-b0f8-2d152c5ba7d5",
  "agent_role": "actor",
  "base_prompt_source": {
    "Service": {
      "prompt_id": "default"
    }
  },
  "enhanced_prompt": "You are a helpful AI assistant...\n\n## Available Tools\n\nYou have access to the following tools:\n\n### File System Tools\n\n#### `list_directory`\n\nList files and directories...",
  "available_tools": [
    "read_file",
    "create_file",
    "update_file",
    "list_directory",
    "grep",
    "glob",
    "search",
    "append_file",
    "delete_file",
    "replace_in_file",
    "edit_lines"
  ],
  "stats": {
    "total_length": 4523,
    "fragment_count": 5,
    "tool_count": 11,
    "enhancement_time_ms": 12
  }
}
```

## Configuration Options

Can add configuration to control whether to save snapshots:

```rust
pub struct DebugConfig {
    /// Whether to save system prompt snapshots
    pub save_system_prompt_snapshots: bool,

    /// Whether to include detailed fragment information
    pub include_fragment_details: bool,

    /// Number of historical versions to keep (0 = keep only latest)
    pub max_snapshot_versions: usize,
}
```

## Optimization Directions

### 1. Historical Version Management

```
data/contexts/{context_id}/
├── context.json
├── system_prompt.json              # Latest version
└── system_prompts/                 # Historical versions (optional)
    ├── version_001.json
    ├── version_002.json
    └── version_042.json
```

### 2. Diff Comparison

Calculate diff with previous version when saving:

```rust
pub struct PromptDiff {
    pub previous_version: u64,
    pub changes: Vec<Change>,
}

pub enum Change {
    ToolAdded(String),
    ToolRemoved(String),
    RoleChanged { from: AgentRole, to: AgentRole },
    ContentModified { section: String, diff: String },
}
```

### 3. Performance Optimization

- Use async I/O to avoid blocking main flow
- Save only when prompt actually changes
- Use LRU cache to avoid repeated reads

## API Endpoints (Optional)

Provide query interface for frontend:

```rust
// GET /api/contexts/{context_id}/system-prompt
async fn get_system_prompt_snapshot(
    context_id: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    // Return latest system_prompt.json
}

// GET /api/contexts/{context_id}/system-prompt/versions
async fn list_prompt_versions(
    context_id: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    // Return all historical versions
}
```

## Test Plan

1. **Unit Tests**
   - Test snapshot serialization/deserialization
   - Test version number increment
   - Test file read/write

2. **Integration Tests**
   - Create context → send message → verify system_prompt.json exists
   - Modify role → send message → verify version number increments
   - Add tools → verify tools list updates

3. **Manual Verification**
   - Check generated JSON format
   - Compare with actual content sent to LLM
   - Verify prompt differences for different roles

## Implementation Priority

**Phase 1 (MVP)**:
- ✅ Basic data structure
- ✅ Save latest system_prompt.json
- ✅ Include complete enhanced prompt
- ✅ Basic statistics

**Phase 2 (Enhancement)**:
- ⏳ Add fragment details
- ⏳ Version history management
- ⏳ API query interface

**Phase 3 (Optimization)**:
- ⏳ Diff comparison
- ⏳ Performance optimization
- ⏳ Frontend visualization

## Time Estimate

- **Phase 1**: 2-3 hours
  - Data structure definition: 30 minutes
  - Storage implementation: 1 hour
  - LlmRequestBuilder integration: 1 hour
  - Testing: 30 minutes

- **Phase 2**: 3-4 hours
- **Phase 3**: 4-6 hours

## Risks and Considerations

1. **Disk Space** - Saving on every message may consume significant space
   - Mitigation: Regularly clean up old versions

2. **Concurrent Writes** - Multiple requests updating simultaneously may conflict
   - Mitigation: Use version number optimistic locking

3. **Sensitive Information** - Prompt may contain user data
   - Mitigation: Can disable this feature in production

## Next Actions

1. Review this design document
2. Confirm if adjustments are needed
3. Start implementing Phase 1
4. Test and verify
5. Iterate based on feedback
