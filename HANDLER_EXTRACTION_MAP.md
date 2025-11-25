# Handler Extraction Map - Original context_controller.rs

## Source File Information
- **Original File**: `HEAD:crates/web_service/src/controllers/context_controller.rs`
- **Total Lines**: 2,017
- **Recovery Location**: `/tmp/context_controller_original.rs`

---

## 📊 Complete Handler Inventory

### ✅ ALREADY EXTRACTED (8 handlers)

#### Workspace Domain (`workspace.rs`) ✅
1. **`set_context_workspace`** - Line 437-510
   - Route: `PUT /contexts/{id}/workspace`
   - Status: ✅ Extracted

2. **`get_context_workspace`** - Line 512-541
   - Route: `GET /contexts/{id}/workspace`
   - Status: ✅ Extracted

3. **`list_workspace_files`** - Line 544-612
   - Route: `GET /contexts/{id}/workspace/files`
   - Status: ✅ Extracted

#### Title Generation Domain (`title_generation.rs`) ✅
4. **`generate_context_title`** - Line 615-794
   - Route: `POST /contexts/{id}/generate-title`
   - Status: ✅ Extracted

#### Messages Domain (`messages.rs`) ✅
5. **`get_context_messages`** - Line 1016-1093
   - Route: `GET /contexts/{id}/messages`
   - Status: ✅ Extracted

6. **`get_message_content`** - Line 1095-1134
   - Route: `GET /contexts/{context_id}/messages/{message_id}/content`
   - Status: ✅ Extracted

#### Streaming Domain (`streaming.rs`) ✅
7. **`get_streaming_chunks`** - Line 1137-1228
   - Route: `GET /contexts/{context_id}/messages/{message_id}/streaming-chunks`
   - Status: ✅ Extracted

8. **`subscribe_context_events`** - Line 1231-1340
   - Route: `GET /contexts/{id}/events`
   - Status: ✅ Extracted

---

## 🔴 PENDING EXTRACTION (12 handlers)

### Context Lifecycle Domain (`context_lifecycle.rs`) - 6 handlers

9. **`create_context`** - Line 222-309
   - Route: `POST /contexts`
   - Priority: 🔥 HIGH (core CRUD)
   - Complexity: HIGH (creates session, attaches prompts)

10. **`get_context`** - Line 312-370
    - Route: `GET /contexts/{id}`
    - Priority: 🔥 HIGH (core CRUD)
    - Complexity: MEDIUM

11. **`get_context_metadata`** - Line 373-434
    - Route: `GET /contexts/{id}/metadata`
    - Priority: MEDIUM
    - Complexity: LOW

12. **`update_context_config`** - Line 796-851
    - Route: Not annotated with route (helper or internal)
    - Priority: MEDIUM
    - Complexity: MEDIUM

13. **`update_context`** - Line 854-908
    - Route: `PUT /contexts/{id}`
    - Priority: MEDIUM
    - Complexity: MEDIUM

14. **`delete_context`** - Line 911-929
    - Route: `DELETE /contexts/{id}`
    - Priority: MEDIUM
    - Complexity: LOW

15. **`list_contexts`** - Line 932-1013
    - Route: `GET /contexts`
    - Priority: 🔥 HIGH (core CRUD)
    - Complexity: MEDIUM

### Tool Approval Domain (`tool_approval.rs`) - 1 handler

16. **`approve_context_tools`** - Line 1343-1436
    - Route: `POST /contexts/{id}/tools/approve`
    - Priority: 🔥 HIGH (critical workflow)
    - Complexity: HIGH

### Actions Domain (`actions.rs`) - 4 handlers

17. **`send_message_action`** - Line 1438-1554
    - Route: `POST /contexts/{id}/actions/send-message`
    - Priority: 🔥 CRITICAL (primary user action)
    - Complexity: VERY HIGH

18. **`approve_tools_action`** - Line 1556-1633
    - Route: `POST /contexts/{id}/actions/approve-tools`
    - Priority: 🔥 HIGH (critical workflow)
    - Complexity: HIGH

19. **`get_context_state`** - Line 1635-1680
    - Route: `GET /contexts/{id}/state`
    - Priority: MEDIUM
    - Complexity: LOW

20. **`update_agent_role`** - Line 1682-1797
    - Route: `PUT /contexts/{id}/agent-role`
    - Priority: MEDIUM
    - Complexity: MEDIUM

---

## 🛠️ Helper Functions to Extract

### Title Generation Helpers

21. **`auto_generate_title_if_needed`** - Line ~1799-2000+
    - Purpose: Automatically generate title after first response
    - Priority: MEDIUM
    - Domain: `title_generation.rs`

### Other Helpers

22. **`sanitize_title`** - Already extracted ✅
23. **Type definitions and DTOs** - Need to be distributed across domains

---

## 📈 Extraction Statistics

| Category | Count | Status |
|----------|-------|--------|
| **Total Handlers** | 20 | - |
| **Extracted** | 8 | ✅ 40% |
| **Pending** | 12 | 🔴 60% |
| **Helper Functions** | ~1 | 🔴 Pending |

---

## 🎯 Recommended Extraction Order

### Round 1: Core CRUD (Priority 1) 🔥
1. `create_context` (222-309)
2. `get_context` (312-370)
3. `list_contexts` (932-1013)

### Round 2: Critical Actions (Priority 1) 🔥
4. `send_message_action` (1438-1554) - Most complex!
5. `approve_context_tools` (1343-1436)
6. `approve_tools_action` (1556-1633)

### Round 3: Remaining Lifecycle (Priority 2)
7. `get_context_metadata` (373-434)
8. `update_context` (854-908)
9. `delete_context` (911-929)
10. `update_context_config` (796-851)

### Round 4: State & Helpers (Priority 3)
11. `get_context_state` (1635-1680)
12. `update_agent_role` (1682-1797)
13. `auto_generate_title_if_needed` (~1799-2000+)

---

## 📝 Notes

- All line numbers refer to the original file in git HEAD
- Reference file saved at: `/tmp/context_controller_original.rs`
- Current `context_controller.rs` is now just a 21-line re-export file
- All existing domain modules are working and the crate compiles ✅
