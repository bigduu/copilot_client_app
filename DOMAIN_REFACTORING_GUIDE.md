# Domain-Based Refactoring Guide

## Overview

This document outlines the **correct** approach to refactoring large files: **organize by functional domain** (business features), not by technical layers (DTOs, helpers, etc.).

## Why Domain-Based?

✅ **Benefits**:
- Code related to a feature is co-located
- Easier to understand business logic
- Changes to a feature touch fewer files
- Better encapsulation and modularity
- Aligns with Domain-Driven Design principles

❌ **Problems with Technical Layer Approach** (what we initially did):
- Related code scattered across dto.rs, helpers.rs, handlers.rs
- Hard to understand complete feature flow
- Changes require touching multiple files
- Breaks encapsulation of business logic

## Proposed Structure for context_controller.rs

### Current State
```
crates/web_service/src/controllers/
└── context_controller.rs (1,804 lines)
```

### Target Structure (Domain-Based)
```
crates/web_service/src/controllers/context/
├── mod.rs                    # Module exports
├── types.rs                  # Shared types across domains
├── context_lifecycle.rs      # Domain: Context CRUD operations
├── workspace.rs              # Domain: Workspace management
├── messages.rs               # Domain: Message operations
├── title_generation.rs       # Domain: Title generation
├── streaming.rs              # Domain: SSE and streaming
├── tool_approval.rs          # Domain: Tool approval (legacy)
└── actions.rs                # Domain: FSM-driven operations
```

## Domain Breakdown

### 1. Context Lifecycle (`context_lifecycle.rs`)

**Responsibility**: Create, read, update, delete, list, and configure contexts

**Endpoints**:
- `POST /contexts` - create_context
- `GET /contexts` - list_contexts
- `GET /contexts/{id}` - get_context
- `GET /contexts/{id}/metadata` - get_context_metadata
- `GET /contexts/{id}/state` - get_context_state
- `PUT /contexts/{id}` - update_context
- `PATCH /contexts/{id}/config` - update_context_config
- `PUT /contexts/{id}/role` - update_agent_role
- `DELETE /contexts/{id}` - delete_context

**Types** (in this file):
```rust
pub struct CreateContextRequest { ... }
pub struct CreateContextResponse { ... }
pub struct ListContextsResponse { ... }
pub struct ContextSummary { ... }
pub struct ConfigSummary { ... }
pub struct UpdateContextConfigRequest { ... }
pub struct ContextMetadataResponse { ... }
pub struct UpdateAgentRoleRequest { ... }
```

**Why grouped together**: All related to the lifecycle management of a context entity

---

### 2. Workspace Management (`workspace.rs`)

**Responsibility**: Handle workspace-related operations for contexts

**Endpoints**:
- `PUT /contexts/{id}/workspace` - set_context_workspace
- `GET /contexts/{id}/workspace` - get_context_workspace
- `GET /contexts/{id}/workspace/files` - list_workspace_files

**Types**:
```rust
pub struct WorkspaceUpdateRequest { ... }
pub struct WorkspaceInfoResponse { ... }
pub struct WorkspaceFileEntry { ... }
pub struct WorkspaceFilesResponse { ... }
```

**Why grouped together**: All operations related to workspace management feature

---

### 3. Message Operations (`messages.rs`)

**Responsibility**: Retrieve and query messages

**Endpoints**:
- `GET /contexts/{id}/messages` - get_context_messages
- `GET /contexts/{context_id}/messages/{message_id}/content` - get_message_content

**Types**:
```rust
pub struct MessageQuery { ... }
pub struct MessageContentQuery { ... }
```

**Why grouped together**: All related to message retrieval and querying

---

### 4. Title Generation (`title_generation.rs`)

**Responsibility**: Generate and auto-generate titles for contexts

**Endpoints**:
- `POST /contexts/{id}/generate-title` - generate_context_title

**Helper Functions**:
```rust
async fn auto_generate_title_if_needed(...) { ... }
fn extract_message_text(...) -> String { ... }
fn sanitize_title(...) -> String { ... }
```

**Types**:
```rust
pub struct GenerateTitleRequest { ... }
pub struct GenerateTitleResponse { ... }
```

**Why grouped together**: Complete title generation feature with all its logic

---

### 5. Streaming (`streaming.rs`)

**Responsibility**: Handle SSE events and streaming content

**Endpoints**:
- `GET /contexts/{id}/events` - subscribe_context_events
- `GET /contexts/{context_id}/messages/{message_id}/streaming-chunks` - get_streaming_chunks

**Types**:
```rust
pub struct StreamingChunksResponse { ... }
pub struct ChunkDTO { ... }
pub enum SignalEvent { ... }
```

**Why grouped together**: All related to real-time streaming functionality

---

### 6. Tool Approval (`tool_approval.rs`)

**Responsibility**: Legacy tool approval endpoint

**Endpoints**:
- `POST /contexts/{id}/tools/approve` - approve_context_tools (deprecated)

**Types**:
```rust
pub struct ApproveToolsRequest { ... }
```

**Why separated**: Legacy feature, marked for deprecation

---

### 7. Actions (`actions.rs`)

**Responsibility**: FSM-driven action-based API endpoints

**Endpoints**:
- `POST /contexts/{id}/actions/send_message` - send_message_action
- `POST /contexts/{id}/actions/approve_tools` - approve_tools_action

**Helper Functions**:
```rust
fn payload_type(...) -> &'static str { ... }
fn payload_preview(...) -> String { ... }
```

**Types**:
```rust
pub struct SendMessageActionRequest { ... }
pub struct ActionResponse { ... }
pub struct ApproveToolsActionRequest { ... }
```

**Why grouped together**: All FSM-driven action endpoints that process user actions

---

## Implementation Example: `context_lifecycle.rs`

```rust
//! Context lifecycle management - CRUD operations for contexts

use crate::{
    dto::{get_branch_messages, ChatContextDTO},
    middleware::extract_trace_id,
    server::AppState,
};
use actix_web::{
    delete, get, patch, post, put,
    web::{Data, Json, Path, Query},
    HttpRequest, HttpResponse, Result,
};
use log::{error, info};
use serde::{Deserialize, Serialize};
use tracing;
use uuid::Uuid;
use context_manager::AgentRole;

// ============================================================================
// Types for this domain
// ============================================================================

#[derive(Deserialize, Debug)]
pub struct CreateContextRequest {
    pub model_id: String,
    pub mode: String,
    pub system_prompt_id: Option<String>,
    pub workspace_path: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct CreateContextResponse {
    pub id: String,
}

// ... other types ...

// ============================================================================
// Handlers
// ============================================================================

/// Create a new chat context
#[post("/contexts")]
pub async fn create_context(
    app_state: Data<AppState>,
    req: Json<CreateContextRequest>,
    http_req: HttpRequest,
) -> Result<HttpResponse> {
    // Implementation...
}

/// Get a specific context by ID
#[get("/contexts/{id}")]
pub async fn get_context(
    path: Path<Uuid>,
    app_state: Data<AppState>,
    http_req: HttpRequest,
) -> Result<HttpResponse> {
    // Implementation...
}

// ... other handlers ...

// ============================================================================
// Helper functions specific to this domain
// ============================================================================

async fn validate_context_config(...) -> Result<()> {
    // Helper specific to context lifecycle
}
```

## Migration Steps

1. **Create the structure**:
   ```bash
   mkdir -p crates/web_service/src/controllers/context
   ```

2. **Create shared types file**:
   - Extract all DTOs to `types.rs` (shared across domains)
   - Or keep types within their domain files (better encapsulation)

3. **Extract each domain**:
   - Copy handlers for each domain to its file
   - Include domain-specific types in the same file
   - Include domain-specific helpers in the same file

4. **Update mod.rs**:
   ```rust
   pub mod context_lifecycle;
   pub mod workspace;
   pub mod messages;
   pub mod title_generation;
   pub mod streaming;
   pub mod tool_approval;
   pub mod actions;
   
   // Re-export handlers
   pub use context_lifecycle::*;
   pub use workspace::*;
   // ... etc
   ```

5. **Replace context_controller.rs**:
   ```rust
   //! Context controller - organized by functional domains
   
   mod context;
   pub use context::*;
   ```

6. **Test thoroughly**: Ensure all endpoints still work

## Benefits of This Approach

### Scenario: Adding a new workspace feature

**Technical Layer Approach** ❌:
- Add DTO to `dto.rs`
- Add handler to `handlers.rs`
- Add helper to `helpers.rs`
- Update 3 files, scattered changes

**Domain Approach** ✅:
- Add everything to `workspace.rs`
- Update 1 file, all changes co-located

### Scenario: Understanding title generation

**Technical Layer Approach** ❌:
- Check `dto.rs` for types
- Check `handlers.rs` for endpoint
- Check `helpers.rs` for logic
- Jump between 3 files

**Domain Approach** ✅:
- Open `title_generation.rs`
- Everything is there: types, endpoint, helpers
- Read 1 file top-to-bottom

## Frontend Equivalent

The same principle applies to React/TypeScript code:

### ❌ Wrong (Technical Layers):
```
ChatView/
├── hooks/
│   ├── useHook1.ts
│   ├── useHook2.ts
├── components/
│   ├── Component1.tsx
├── utils/
│   └── helpers.ts
```

### ✅ Right (Functional Domains):
```
ChatView/
├── features/
│   ├── scrolling/         # Scroll management feature
│   │   ├── useScrollManagement.ts
│   │   └── ScrollToBottomButton.tsx
│   ├── systemPrompt/      # System prompt feature
│   │   ├── useLoadSystemPrompt.ts
│   │   └── SystemPromptCard.tsx
│   └── messageList/       # Message list feature
│       ├── useVirtualization.ts
│       └── MessageListContainer.tsx
```

## Conclusion

**Key Principle**: Group code by **what it does** (domain/feature), not **what it is** (type/layer).

This makes the codebase:
- Easier to navigate
- Easier to understand
- Easier to modify
- Better encapsulated
- More maintainable

---

**Next Steps**:
1. Apply this pattern to `context_controller.rs`
2. Apply to other large controllers
3. Apply to frontend components
4. Document the pattern for the team
