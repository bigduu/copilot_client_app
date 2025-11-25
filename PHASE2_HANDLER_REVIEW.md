# Phase 2: Context Lifecycle Handlers - Code Review

## Overview
This document shows the **7 core Context Lifecycle handlers** we need to extract, organized by priority.

---

## 🔥 Priority 1: Core CRUD (3 handlers)

### 1. `create_context` (Lines 222-309) - **CRITICAL**

**Route**: `POST /contexts`  
**Complexity**: 🔴 **HIGH** (Most complex - creates session, attaches prompts/workspace)

```rust
#[post("/contexts")]
pub async fn create_context(
    app_state: Data<AppState>,
    req: Json<CreateContextRequest>,
    http_req: HttpRequest,
) -> Result<HttpResponse>
```

**What it does**:
1. ✅ Creates new chat session via `session_manager.create_session()`
2. ✅ Optionally attaches system_prompt_id to config
3. ✅ Optionally attaches workspace_path
4. ✅ Saves context twice (for prompt and workspace if provided)
5. ✅ Returns new context ID

**Dependencies**:
- DTO: `CreateContextRequest` (lines 27-33)
- DTO: `CreateContextResponse` (lines 35-38)
- Service: `session_manager.create_session()`
- Helper: `extract_trace_id()` from middleware

**Key Logic**:
- Uses write lock once to attach both system_prompt_id and workspace_path
- Marks context as dirty after changes
- Saves context to storage after modifications

---

### 2. `get_context` (Lines 312-370) - **HIGH**

**Route**: `GET /contexts/{id}`  
**Complexity**: 🟡 **MEDIUM**

```rust
#[get("/contexts/{id}")]
pub async fn get_context(
    path: Path<Uuid>,
    app_state: Data<AppState>,
    http_req: HttpRequest,
) -> Result<HttpResponse>
```

**What it does**:
1. ✅ Loads context from storage via `session_manager.load_context()`
2. ✅ Converts ChatContext to DTO in a short-lived read lock
3. ✅ Returns full context details

**Dependencies**:
- DTO: `ChatContextDTO` from `crate::dto` (already exists)
- Service: `session_manager.load_context()`
- Helper: `extract_trace_id()`

**Key Logic**:
- Very clean - just load, convert to DTO, return
- Proper error handling for not found vs errors
- Releases read lock before returning

---

### 3. `list_contexts` (Lines 932-1013) - **HIGH**

**Route**: `GET /contexts`  
**Complexity**: 🟡 **MEDIUM** (Iterates all contexts)

```rust
#[get("/contexts")]
pub async fn list_contexts(
    app_state: Data<AppState>,
    _http_req: HttpRequest,
) -> Result<HttpResponse>
```

**What it does**:
1. ✅ Gets all context IDs from storage
2. ✅ Loads each context and builds summary
3. ✅ Returns list of ContextSummary objects

**Dependencies**:
- DTO: `ListContextsResponse` (lines 40-43)
- DTO: `ContextSummary` (lines 45-57)
- DTO: `ConfigSummary` (lines 59-65)
- Service: `session_manager.list_contexts()`
- Service: `session_manager.load_context()` (called for each ID)

**Key Logic**:
- Iterates through all context IDs
- Has fallback for contexts that fail to load (returns placeholder)
- Good for frontend to show all chat contexts

---

## 🟡 Priority 2: Remaining Lifecycle (4 handlers)

### 4. `get_context_metadata` (Lines 373-434) - **MEDIUM**

**Route**: `GET /contexts/{id}/metadata`  
**Complexity**: 🟢 **LOW** (Lightweight alternative to get_context)

```rust
#[get("/contexts/{id}/metadata")]
pub async fn get_context_metadata(
    path: Path<Uuid>,
    app_state: Data<AppState>,
    http_req: HttpRequest,
) -> Result<HttpResponse>
```

**What it does**:
1. ✅ Loads context (same as get_context)
2. ✅ Returns only lightweight metadata (no messages)
3. ✅ Used for Signal-Pull architecture

**Dependencies**:
- DTO: `ContextMetadataResponse` (lines 111-128)
- Service: `session_manager.load_context()`

**Notes**:
- Very similar to `get_context` but returns less data
- Good for polling/SSE scenarios where full DTO is overkill

---

### 5. `update_context` (Lines 854-908) - **MEDIUM**

**Route**: `PUT /contexts/{id}`  
**Complexity**: 🟡 **MEDIUM**

```rust
#[put("/contexts/{id}")]
pub async fn update_context(
    path: Path<Uuid>,
    req: Json<ChatContextDTO>,
    app_state: Data<AppState>,
    http_req: HttpRequest,
) -> Result<HttpResponse>
```

**What it does**:
1. ✅ Loads context
2. ✅ Updates only system_prompt_id (note: limited scope!)
3. ✅ Marks dirty and saves

**Dependencies**:
- DTO: `ChatContextDTO` (from crate::dto)
- Service: `session_manager.load_context()`
- Service: `session_manager.save_context()`

**Notes**:
- Comment says "we only support updating the system prompt ID"
- Full context updates would be complex (deserializing/merging)
- Consider if this should be enhanced or kept minimal

---

### 6. `delete_context` (Lines 911-929) - **LOW**

**Route**: `DELETE /contexts/{id}`  
**Complexity**: 🟢 **LOW** (Simple delegation)

```rust
#[delete("/contexts/{id}")]
pub async fn delete_context(
    path: Path<Uuid>, 
    app_state: Data<AppState>
) -> Result<HttpResponse>
```

**What it does**:
1. ✅ Delegates to `session_manager.delete_context()`
2. ✅ Returns success/error

**Dependencies**:
- Service: `session_manager.delete_context()`

**Notes**:
- Very simple handler - just wraps service call
- No trace_id needed

---

### 7. `update_context_config` (Lines 796-851) - **MEDIUM**

**Route**: None (appears to be a helper function, not an HTTP handler)  
**Complexity**: 🟡 **MEDIUM**

**REVIEW NEEDED**: Let me check if this is actually used as a handler...

---

## 📦 Required DTOs to Extract

All these DTOs need to be moved to `context_lifecycle.rs`:

```rust
// Request DTOs
CreateContextRequest (lines 27-33)
UpdateContextConfigRequest (lines 102-108)

// Response DTOs
CreateContextResponse (lines 35-38)
ListContextsResponse (lines 40-43)
ContextSummary (lines 45-57)
ConfigSummary (lines 59-65)
ContextMetadataResponse (lines 111-128)
```

**Already in shared DTO module** (don't extract):
- `ChatContextDTO` - used by multiple domains

---

## 🔍 Dependencies Analysis

### External Crates
```rust
use actix_web::{delete, get, post, put, web::{Data, Json, Path}, HttpRequest, HttpResponse};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use tracing; // for debug/info/error logging
```

### Internal Dependencies
```rust
use crate::dto::ChatContextDTO;
use crate::middleware::extract_trace_id;
use crate::server::AppState;
```

### Services Used
- `app_state.session_manager.create_session()`
- `app_state.session_manager.load_context()`
- `app_state.session_manager.save_context()`
- `app_state.session_manager.delete_context()`
- `app_state.session_manager.list_contexts()`

---

## ⚠️ Potential Issues

### 1. **Duplicate SignalEvent Type**
- Lines 147-174 define `SignalEvent` enum
- BUT we already extracted this to `streaming.rs`!
- ✅ **Solution**: Don't re-extract it, just import from streaming module

### 2. **update_context_config Mystery**
- Line 796 has `update_context_config` function
- Need to verify if this is:
  - a) A standalone HTTP handler (missing route annotation?)
  - b) A helper function called by other handlers?

### 3. **Helper Functions**
- `extract_message_text` (line 176) - appears to be title generation helper
- Should this go to title_generation.rs or stay as shared utility?

---

## 🎯 Extraction Strategy

### Option A: Extract All 7 Handlers at Once (Fastest)
- Create complete `context_lifecycle.rs` in one go
- Extract all DTOs together
- Update `mod.rs` routing once

**Pros**: Complete domain in one session  
**Cons**: Large change, harder to review

### Option B: Extract in 2 Rounds (Safer)
**Round 1**: Priority 1 handlers (create, get, list)
**Round 2**: Priority 2 handlers (metadata, update, delete)

**Pros**: Incremental, easier to test  
**Cons**: Two separate rounds of routing updates

### Option C: Extract One at a Time (Safest)
Extract and test each handler individually

**Pros**: Maximum safety, easy rollback  
**Cons**: Very slow, many routing updates

---

## 💡 My Recommendation

**Go with Option B** - Extract in 2 rounds:

### Round 1: Core CRUD (Now)
1. Extract `create_context`, `get_context`, `list_contexts`
2. Extract related DTOs
3. Update routing
4. Test basic CRUD operations

### Round 2: Remaining Lifecycle (Next)
1. Extract `get_context_metadata`, `update_context`, `delete_context`
2. Investigate `update_context_config`
3. Final routing updates

This balances speed with safety and gives you working CRUD functionality quickly.

---

## ❓ Questions for You

1. **Do you want to extract all 7 at once or split into 2 rounds?**

2. **Should we investigate `update_context_config` first?** (Line 796)
   - It might be a handler missing route annotation
   - Or it might be a helper we don't need

3. **Any concerns about the complexity of these handlers?**
   - They're all pretty straightforward
   - Biggest complexity is `create_context` with the multi-save logic

**What would you like to do?** 🚀
