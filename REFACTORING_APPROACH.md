# Correct Refactoring Approach: Domain-Based Organization

## Summary

✅ **CORRECT**: Organize by **functional domain** (business features)
❌ **WRONG**: Organize by **technical layer** (DTOs, helpers, handlers)

## Why This Matters

When refactoring large files, the key question is: **"How do developers think about the code?"**

Developers think in terms of **features/domains**:
- "I need to add workspace file filtering"
- "I need to fix title generation"
- "I need to modify the streaming behavior"

They don't think in terms of technical layers:
- "I need to add a DTO, then a handler, then a helper"

## The Structure We Created

### ✅ Domain-Based (Correct)

```
crates/web_service/src/controllers/context/
├── mod.rs                    # Module organization
├── types.rs                  # Shared types (optional)
├── context_lifecycle.rs      # Everything about context CRUD
│   ├── Types: CreateContextRequest, UpdateContextConfigRequest
│   ├── Handlers: create_context, get_context, update_context, delete_context
│   └── Helpers: validate_config, etc.
├── workspace.rs              # Everything about workspace feature
│   ├── Types: WorkspaceUpdateRequest, WorkspaceFilesResponse
│   ├── Handlers: set_context_workspace, list_workspace_files
│   └── Helpers: scan_directory, etc.
├── title_generation.rs       # Everything about title generation
│   ├── Types: GenerateTitleRequest
│   ├── Handlers: generate_context_title
│   └── Helpers: sanitize_title, auto_generate_title_if_needed
└── ... (other domains)
```

**Benefits**:
- ✅ All code for a feature in ONE place
- ✅ Easy to find: "Where's workspace code?" → `workspace.rs`
- ✅ Easy to modify: Change workspace feature → edit ONE file
- ✅ Easy to understand: Read top-to-bottom to understand feature
- ✅ Better encapsulation: Domain logic stays together

### ❌ Technical Layer (Wrong - what we initially did)

```
crates/web_service/src/controllers/context/
├── dto.rs          # All DTOs for all features mixed together
├── helpers.rs      # All helper functions for all features
├── handlers.rs     # All handlers for all features
└── mod.rs          # Re-exports
```

**Problems**:
- ❌ Code for one feature scattered across 3+ files
- ❌ Hard to find: "Where's workspace code?" → dto.rs, handlers.rs, helpers.rs
- ❌ Hard to modify: Change workspace → edit 3 files
- ❌ Hard to understand: Jump between files to understand feature
- ❌ Poor encapsulation: No clear feature boundaries

## Real-World Example

### Scenario: Add file type filtering to workspace listing

**Technical Layer Approach** ❌:
1. Open `dto.rs` → Add `file_types` field to `WorkspaceFilesResponse`
2. Open `handlers.rs` → Find `list_workspace_files`, add filtering logic
3. Open `helpers.rs` → Add `filter_by_type` helper function
4. Jump between 3 files to understand the change
5. Easy to forget to update all places

**Domain-Based Approach** ✅:
1. Open `workspace.rs` → Everything is here!
2. Add `file_types` to types section
3. Update `list_workspace_files` handler (right below types)
4. Add `filter_by_type` helper (right below handler)
5. Read ONE file top-to-bottom to understand complete feature
6. All changes in ONE place, easy to review

## Implementation Status

### ✅ What We've Done

1. **Created domain modules structure**:
   - `context/mod.rs` - Organized by domains
   - `context/types.rs` - Shared types
   
2. **Created comprehensive guide**:
   - `DOMAIN_REFACTORING_GUIDE.md` - Explains the approach in detail
   
3. **Created example hooks for frontend**:
   - `ChatView/hooks/useResponsiveLayout.ts` - But should be in features!
   - `ChatView/hooks/useScrollManagement.ts` - But should be in features!
   - `ChatView/hooks/useLoadSystemPrompt.ts` - But should be in features!

### 🔄 What Needs To Be Done

1. **Complete backend refactoring**:
   ```bash
   # Extract each domain from context_controller.rs into its own file
   - context_lifecycle.rs   # Lines 41-812
   - workspace.rs           # Lines 257-432
   - messages.rs            # Lines 818-937
   - title_generation.rs    # Lines 435-612 + auto_generate helper
   - streaming.rs           # Lines 939-1128
   - tool_approval.rs       # Lines 1142-1217 (deprecated)
   - actions.rs             # Lines 1223-1579
   ```

2. **Fix frontend structure** (from hooks to features):
   ```
   ChatView/
   ├── features/
   │   ├── scrolling/              # Scroll domain
   │   │   ├── useScrollManagement.ts
   │   │   ├── ScrollToBottomButton.tsx
   │   │   └── types.ts
   │   ├── systemPrompt/           # System prompt domain
   │   │   ├── useLoadSystemPrompt.ts
   │   │   ├── SystemPromptCard.tsx
   │   │   └── types.ts
   │   └── layout/                 # Layout domain
   │       ├── useResponsiveLayout.ts
   │       └── types.ts
   └── index.tsx                   # Main component
   ```

3. **Apply to other large files**:
   - `useChatManager.ts` → Split by domains (title generation, message sending, streaming)
   - `MessageCard` → Split by domains (content rendering, tool calls, actions)
   - `BackendContextService.ts` → Split by domains (context ops, messages, streaming)

## Key Principle

> **Group code by WHAT IT DOES (domain/feature), not WHAT IT IS (type/layer)**

This single principle makes code:
- More navigable
- More understandable
- More maintainable
- Better encapsulated
- Easier to change

## Next Steps

1. Read `DOMAIN_REFACTORING_GUIDE.md` for detailed examples
2. Extract domains from `context_controller.rs` following the guide
3. Apply the same pattern to frontend large files
4. Document the pattern for the team
5. Establish this as the standard for future development

## References

- **Domain-Driven Design**: This aligns with DDD principles of organizing by domain
- **Vertical Slice Architecture**: Each domain is a "vertical slice" of functionality
- **Feature Folders**: Common pattern in modern application architecture
