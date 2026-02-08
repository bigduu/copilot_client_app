# Phase 1.5 Quick Start Guide

**Date**: 2025-11-08
**Status**: Design Locked, Ready for Implementation
**Change ID**: `refactor-context-session-architecture`

---

## 🚀 Quickly Restore Context in a New Session

### 1. View Change Overview

```bash
# View basic change information
openspec show refactor-context-session-architecture

# View all active changes
openspec list

# View detailed delta specs
openspec show refactor-context-session-architecture --json --deltas-only
```

### 2. View Task List

```bash
# Directly view tasks.md
cat openspec/changes/refactor-context-session-architecture/tasks.md

# Or open with editor
code openspec/changes/refactor-context-session-architecture/tasks.md
```

**Current Progress**: Phase 1.5 task list is in `tasks.md` lines 171-350

### 3. View Technical Design

```bash
# View design.md (contains Decision 3.1 and 4.5.1)
code openspec/changes/refactor-context-session-architecture/design.md
```

**Key Decision Locations**:
- Decision 3.1: Context-Local Message Pool (design.md:1086-1181)
- Decision 4.5.1: Signal-Pull Sync Model (design.md:1296-1506)

### 4. View Implementation Plan

```bash
# Detailed implementation plan document
code docs/reports/refactoring/signal_pull_architecture_implementation_plan_CN.md
```

---

## 📋 Phase 1.5 Task Overview

### Core Goal
Implement **Context-Local Message Pool** storage architecture and **Signal-Pull** synchronization model

### 8 Main Task Modules

1. **1.5.1** Extend MessageMetadata ⏳
   - Add MessageSource, DisplayHint, StreamingMetadata
   - File: `crates/context_manager/src/structs/metadata.rs`

2. **1.5.2** Implement StreamingResponse message type ⏳
   - StreamChunk + StreamingResponseMsg
   - File: `crates/context_manager/src/structs/message_types.rs`

3. **1.5.3** Context integrated streaming processing ⏳
   - begin_streaming_llm_response / append_streaming_chunk / finalize_streaming_response
   - File: `crates/context_manager/src/structs/context_lifecycle.rs`

4. **1.5.4** Implement REST API endpoints ⏳
   - GET /contexts/{id}
   - GET /contexts/{id}/messages?ids={...}
   - GET /contexts/{id}/messages/{msg_id}/content?from_sequence={N}
   - File: `crates/web_service/src/routes/context_routes.rs`

5. **1.5.5** Implement SSE signal push ⏳
   - GET /contexts/{id}/stream
   - SSESignal enum + broadcast mechanism
   - File: `crates/web_service/src/routes/sse_routes.rs`

6. **1.5.6** Storage layer implementation ⏳
   - FileSystemMessageStorage
   - Context-Local Message Pool structure
   - File: `crates/context_manager/src/storage/message_storage.rs`

7. **1.5.7** Create OpenSpec Spec Delta ⏳
   - specs/sync/spec.md
   - Signal-Pull and Message Pool requirements

8. **1.5.8** Integration testing ⏳
   - End-to-end streaming tests
   - Storage integration tests
   - Load testing

---

## 🎯 Recommended Implementation Order

### Phase 1: Core Data Structures (1-2 days)
```
1.5.1 → 1.5.2 → 1.5.3
```
- Complete MessageMetadata extension first
- Then implement StreamingResponse type
- Finally integrate into Context lifecycle

### Phase 2: API Layer (1 day)
```
1.5.4 → 1.5.5
```
- REST API endpoints
- SSE signal push

### Phase 3: Storage Layer (1 day)
```
1.5.6
```
- FileSystemMessageStorage implementation

### Phase 4: Documentation and Testing (0.5 day)
```
1.5.7 → 1.5.8
```
- OpenSpec delta
- Integration tests

---

## 📚 Key Document Index

### Design Documents
- `openspec/changes/refactor-context-session-architecture/design.md`
  - Decision 3.1: Context-Local Message Pool
  - Decision 4.5.1: Signal-Pull Synchronization Model
  - Detailed API contract specifications

### Implementation Plan
- `docs/reports/refactoring/signal_pull_architecture_implementation_plan_CN.md`
  - Detailed task breakdown
  - Code examples and structure definitions
  - Test case checklist
  - Effort estimation

### Related Reports
- `docs/reports/refactoring/storage_architecture_gap_analysis_CN.md`
- `docs/reports/refactoring/frontend_backend_state_sync_review_CN.md`
- `docs/reports/archive/refactoring/phase1_message_type_system_summary_CN.md`

---

## 🔍 Quick Code Location Guide

### Existing Related Files

```bash
# Message type system (Phase 1 completed)
crates/context_manager/src/structs/
├── message_types.rs      # RichMessageType enum
├── message.rs            # InternalMessage (already has rich_type field)
├── message_compat.rs     # Compatibility layer
└── message_helpers.rs     # Helper constructors

# Metadata structure (needs extension)
crates/context_manager/src/structs/metadata.rs

# Context lifecycle (needs streaming methods)
crates/context_manager/src/structs/context_lifecycle.rs

# Web Service routes (needs new additions)
crates/web_service/src/routes/
├── context_routes.rs     # REST API (needs creation or extension)
└── sse_routes.rs         # SSE endpoints (needs creation)

# Storage layer (needs creation)
crates/context_manager/src/storage/
└── message_storage.rs    # FileSystemMessageStorage (needs creation)
```

---

## ✅ Verification Checklist

Before starting implementation, confirm:

- [ ] Have read Decision 3.1 and 4.5.1 in `design.md`
- [ ] Have read `signal_pull_architecture_implementation_plan_CN.md`
- [ ] Understand Context-Local Message Pool storage structure
- [ ] Understand Signal-Pull synchronization model
- [ ] Have viewed Phase 1.5 task list in `tasks.md`

---

## 🛠️ Development Workflow

### 1. Start New Task

```bash
# View current task status
grep -n "1.5.1" openspec/changes/refactor-context-session-architecture/tasks.md

# Mark task as in progress (manually update tasks.md)
# - [ ] → - [x] (when complete)
```

### 2. Write Code

Implement according to code examples and structure definitions in `signal_pull_architecture_implementation_plan_CN.md`.

### 3. Run Tests

```bash
# Run context_manager tests
cd crates/context_manager
cargo test

# Run web_service tests
cd ../web_service
cargo test
```

### 4. Validate OpenSpec

```bash
# Validate change validity
openspec validate refactor-context-session-architecture --strict
```

### 5. Update Task Status

After completing each subtask, update the checkbox in `tasks.md`:
```markdown
- [x] 1.5.1.1 Add MessageSource enum
```

---

## 📝 Example: Starting Task 1.5.1

### Step 1: View Task Details

```bash
# View detailed requirements for 1.5.1 in tasks.md
grep -A 20 "1.5.1 Extend MessageMetadata" openspec/changes/refactor-context-session-architecture/tasks.md
```

### Step 2: View Code Examples in Implementation Plan

```bash
# View detailed design for MessageMetadata extension
grep -A 50 "Task 1.5.1: Extend MessageMetadata" docs/reports/refactoring/signal_pull_architecture_implementation_plan_CN.md
```

### Step 3: View Existing Code

```bash
# View current MessageMetadata structure
cat crates/context_manager/src/structs/metadata.rs
```

### Step 4: Start Implementation

Extend `MessageMetadata` according to the structure definitions in the implementation plan.

---

## 🎓 Key Concepts Quick Reference

### Context-Local Message Pool
- Each Context is a self-contained folder
- All messages stored in `contexts/{ctx_id}/messages_pool/`
- Branch operations have zero file I/O (only modify metadata.json)
- Delete Context = delete entire folder (no GC needed)

### Signal-Pull Model
- **SSE Signal**: Only push lightweight notifications (message_id + sequence)
- **REST Pull**: Frontend actively fetches data
- **Self-healing**: Automatically repair lost signals through sequence numbers

### StreamingResponse
- Complete streaming response record (chunks + metadata)
- Supports frontend "replay" streaming effect
- Includes timestamps, intervals, token usage, and other metadata

---

## 🚨 Common Questions

### Q: How do I know where to start?
A: Start with Task 1.5.1 and implement in order. Each task has a detailed subtask checklist.

### Q: What if I encounter design issues?
A: Refer to Decision 3.1 and 4.5.1 in `design.md`, or check the implementation plan document.

### Q: How do I verify if implementation is correct?
A:
1. Run tests (`cargo test`)
2. Validate OpenSpec (`openspec validate --strict`)
3. Check task list (all subtasks marked complete)

### Q: Can code examples in the implementation plan be used directly?
A: Code examples are pseudocode/structure definitions and need to be adjusted for the actual codebase. Mainly reference structure and field definitions.

---

## 📞 Need Help?

If you encounter issues in a new session:

1. **View design document**: `design.md` contains all technical decisions
2. **View implementation plan**: `signal_pull_architecture_implementation_plan_CN.md` contains detailed steps
3. **View task list**: `tasks.md` contains all todo items
4. **Run OpenSpec command**: `openspec show refactor-context-session-architecture`

---

**Good luck with implementation!** 🚀




