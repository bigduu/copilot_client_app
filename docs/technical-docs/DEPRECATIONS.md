# Deprecated API List

This document records all deprecated API endpoints and features, along with recommended alternatives.

---

## 🚨 Phase 2.0 Pipeline Architecture Deprecation

### ❌ `SystemPromptEnhancer` Service (Deprecated)

**Deprecated Version**: v0.2.0
**Planned Removal**: v0.3.0

**Location**: `crates/web_service/src/services/system_prompt_enhancer.rs`

**Issues**:
- Responsibilities overlap with the new Pipeline architecture
- Difficult to test and extend
- Functional overlap with `ToolEnhancementProcessor` and `SystemPromptProcessor`
- Caching logic should be handled uniformly at the Pipeline level

**Alternative**:
```rust
✅ Use: context_manager::pipeline processors

// Tool definition injection
ToolEnhancementProcessor

// System Prompt assembly
SystemPromptProcessor

// Future features (TODO Phase 2.x):
MermaidProcessor        // Mermaid diagram support
TemplateProcessor       // Template variable substitution
```

**Migration Example**:

Old code (deprecated):
```rust
// Using SystemPromptEnhancer
let enhancer = SystemPromptEnhancer::with_default_config(tool_registry);
let enhanced = enhancer.enhance_prompt(base_prompt, &AgentRole::Actor).await?;
```

New code (recommended):
```rust
// Using Pipeline processors
use context_manager::pipeline::*;
use context_manager::pipeline::processors::*;

let pipeline = MessagePipeline::new()
    .register(Box::new(ValidationProcessor::new()))
    .register(Box::new(FileReferenceProcessor::new(workspace_root)))
    .register(Box::new(ToolEnhancementProcessor::new()))
    .register(Box::new(SystemPromptProcessor::with_base_prompt(base_prompt)));

let output = pipeline.execute(message).await?;
```

**Benefits**:
- ✅ Modular: Each processor has a single responsibility
- ✅ Testable: Test each processor independently
- ✅ Extensible: Easily add new processors
- ✅ Consistent: Unified message processing flow

**Retained Features** (to be migrated to new Processor):
- Mermaid diagram support → `MermaidProcessor` (TODO)
- Template variable substitution → `TemplateProcessor` (TODO)
- Caching mechanism → Pipeline configuration (TODO)

---

## Web Service API Endpoints

### 1. Context Management - Old CRUD Endpoint

#### ❌ `POST /contexts/{id}/messages` (Deprecated)

**Deprecated Version**: v0.2.0
**Planned Removal**: v0.3.0

**Issues**:
- Does not trigger FSM (Finite State Machine)
- Does not generate AI responses
- Does not support tool calling flow
- Only serves as a CRUD endpoint for direct message operations

**Alternative**:
```
✅ Use: POST /contexts/{id}/actions/send_message
```

**Migration Example**:

Old code:
```typescript
// ❌ Deprecated approach
await fetch(`/contexts/${contextId}/messages`, {
  method: 'POST',
  body: JSON.stringify({
    role: 'user',
    content: 'Hello',
    branch: 'main'
  })
});
// Will not trigger AI response!
```

New code:
```typescript
// ✅ Recommended approach
await fetch(`/contexts/${contextId}/actions/send_message`, {
  method: 'POST',
  body: JSON.stringify({
    message: {
      type: 'text',
      text: 'Hello'
    }
  })
});
// Triggers complete FSM flow, including AI response and tool calls
```

---

### 2. Tool Controller - All Endpoints (Deprecated)

**Deprecated Version**: v0.2.0
**Planned Removal**: v0.3.0

The tool system has been refactored to an LLM-driven model. User-triggered actions should use the Workflow system.

#### ❌ `POST /tools/execute` (Deprecated)

**Issue**: Direct tool execution bypasses the LLM decision-making process

**Alternative**:
```
✅ Use: Workflow system
   - POST /v1/workflows/execute
   - Or let LLM agent call tools automatically
```

#### ❌ `GET /tools/categories` (Deprecated)

**Issue**: Tool categories have been migrated to Workflow

**Alternative**:
```
✅ Use: GET /v1/workflows/categories
```

#### ❌ `GET /tools/category/{id}/info` (Deprecated)

**Issue**: Tool category information has been migrated to Workflow

**Alternative**:
```
✅ Use: Workflow category info endpoint
```

---

## Migration Timeline

| Version | Action | Timeline |
|---------|--------|----------|
| v0.2.0 (current) | Mark as deprecated, add warning logs | ✅ Completed |
| v0.2.1 | Add migration guide and examples | 📅 Planned |
| v0.2.5 | Add `X-Deprecated` header to responses | ✅ Completed |
| v0.3.0 | **Completely remove** deprecated endpoints | 🔜 Planned |

---

## Checking for Deprecated Usage in Code

### Rust Backend

Deprecation warnings will be displayed during compilation:

```bash
cargo build
# warning: use of deprecated function `add_context_message`: ...
```

### Frontend

Search for usage of deprecated endpoints:

```bash
# Find old messages endpoints
grep -r "POST.*contexts.*messages" frontend/

# Find old tool endpoints
grep -r "tools/execute" frontend/
grep -r "tools/categories" frontend/
```

---

## Deprecation Policy

We follow the following deprecation policy:

1. **Marking Phase** (current version)
   - Add Rust `#[deprecated]` attribute
   - Add detailed documentation
   - Runtime log warnings
   - Add `X-Deprecated: true` header to responses

2. **Notification Phase** (next minor version)
   - Update API documentation
   - Provide migration guide
   - Highlight in CHANGELOG

3. **Removal Phase** (next major version)
   - Completely remove deprecated code
   - Update tests
   - Update documentation

---

## New Architecture Benefits

### Signal-Pull Architecture (v0.2.0+)

The new Context API adopts Signal-Pull architecture:

**Benefits**:
- ✅ Lightweight SSE signaling (<1KB)
- ✅ REST API for on-demand data fetching
- ✅ Self-healing mechanism (sequence number driven)
- ✅ Single Source of Truth (SSOT)

**New Endpoints**:
```
GET /contexts/{id}/metadata              # Lightweight metadata
GET /contexts/{id}/messages?ids=...      # Batch query
GET /contexts/{id}/messages/{msg}/streaming-chunks  # Incremental pull
GET /contexts/{id}/events                # SSE event subscription
```

### FSM-Driven Architecture

The new message sending flow is fully driven by FSM:

**Flow**:
```
User Message → FSM State Transition → LLM Processing → Tool Call → Response Generation
```

**Endpoints**:
```
POST /contexts/{id}/actions/send_message     # FSM-driven message sending
POST /contexts/{id}/actions/approve_tools    # FSM-driven tool approval
GET  /contexts/{id}/state                    # Get FSM state
```

---

## Help and Feedback

If you encounter issues during migration:

1. Check the migration examples in this document
2. Refer to design documents in `openspec/changes/refactor-context-session-architecture/`
3. Check integration tests: `crates/web_service/tests/signal_pull_integration_tests.rs`
4. Submit an Issue or contact the development team

---

**Last Updated**: 2025-11-08
**Maintainer**: Development Team

