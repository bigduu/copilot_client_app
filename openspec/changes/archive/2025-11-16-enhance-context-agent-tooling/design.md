# Enhance Context Agent Tooling - Design Document

## Context

**The Context Manager is the core orchestrator** of this system. All agent logic, state management, and tool execution flows through the context manager crate.

### Current Architecture

The system follows a clean separation of concerns:

1. **Context Manager (Core)** - `crates/context_manager/`
   - Orchestrates all conversation flow and agent loops
   - Manages state transitions via FSM (Finite State Machine)
   - Handles tool execution through `process_auto_tool_step` method
   - Drives multi-round agent loops with approval gates
   - Uses `ToolRuntime` trait to execute tools (implementation-agnostic)

2. **Tool System (Tool Implementations)** - `crates/tool_system/`
   - Provides concrete tool implementations (read_file, search, etc.)
   - Tools implement the `Tool` trait interface
   - Auto-registers tools using `auto_register_tool!` macro

3. **Web Service (Runtime Bridge)** - `crates/web_service/`
   - Provides `ContextToolRuntime` implementing `ToolRuntime` trait
   - Bridges context manager to `ToolExecutor` from tool_system
   - Handles approval flow via `ApprovalManager`

**Key Point**: Context manager drives everything. When we add new tools, context manager's existing logic (`process_auto_tool_step`, agent loop, approval flow) handles them automatically through the `ToolRuntime` interface.

### The Problem

The context manager's agent loop architecture is robust and complete, but the available tools are insufficient for common development tasks. The agent needs enhanced search and editing capabilities to effectively navigate codebases and make precise modifications.

### Stakeholders

- **Context Manager**: Core orchestrator - no changes needed
- **Tool System developers**: Implement new tools following existing `Tool` trait
- **End users**: Experience more capable agent assistance

### Constraints

- **MUST NOT change context manager** - all orchestration logic stays in the core
- Tools must follow existing `Tool` trait interface
- Tools must declare permissions (`ToolPermission`) for role-based access control
- Search tools should be read-only (no approval required) for faster operation
- Editing tools must require approval for safety
- Tools must work within context manager's agent loop timeout and iteration limits
- New tools automatically integrate via `ToolRuntime` trait - no manual wiring needed

## Goals / Non-Goals

### Goals

- ✅ Add content search capability (grep) for finding code patterns
- ✅ Add pattern-based file search (glob) for discovering files
- ✅ Add find-and-replace functionality for targeted file edits
- ✅ Add line-based editing for precise modifications
- ✅ Enhance existing search tool with more options
- ✅ Organize tools into logical categories for better system prompt clarity
- ✅ **Integrate seamlessly with context manager's existing orchestration**

### Non-Goals

- ❌ **Changing context manager** - it's the core, all logic stays there
- ❌ Changing agent loop architecture or execution flow
- ❌ Modifying `ToolRuntime` trait or tool execution infrastructure
- ❌ Adding interactive tools that require mid-execution user input
- ❌ Adding tools for external system integration (git, package managers) in this phase
- ❌ Frontend UI changes (tools are LLM-invoked and orchestrated by backend)
- ❌ Changing existing tool signatures or breaking compatibility

## Decisions

### Decision 1: Use Ripgrep-like Interface for Content Search

**What**: Content search tool follows ripgrep conventions for patterns and filters.

**Parameters**:
```json
{
  "pattern": "regex_pattern",
  "path": "optional/search/path",
  "case_sensitive": false,
  "file_type": "optional_extension",
  "max_results": 50
}
```

**Why**:
- Ripgrep is familiar to developers
- Proven pattern matching syntax
- Efficient for large codebases
- Clear parameter naming

**Alternatives considered**:
- **Simple substring search** - Too limited, doesn't support patterns
- **Custom query language** - Unnecessary complexity, steeper learning curve

### Decision 2: Use Glob Patterns for File Discovery

**What**: File search tool uses glob patterns (e.g., `**/*.tsx`, `src/**/*.test.ts`).

**Parameters**:
```json
{
  "pattern": "**/*.tsx",
  "exclude": ["node_modules", "dist"],
  "max_results": 100
}
```

**Why**:
- Glob patterns are standard in development tools
- Expressive and easy to understand
- Can use existing Rust glob libraries (e.g., `globset`, `glob`)

**Alternatives considered**:
- **Regex-based file matching** - More complex, less intuitive
- **Directory traversal with filters** - More verbose, harder to express intent

### Decision 3: Find-and-Replace with Preview Option

**What**: Replace tool supports both immediate replacement and preview mode.

**Parameters**:
```json
{
  "path": "file/path",
  "find": "pattern_to_find",
  "replace": "replacement_text",
  "is_regex": false,
  "preview_only": false
}
```

**Why**:
- Preview mode lets agent verify changes before committing
- Regex support enables powerful transformations
- Single tool handles both simple and complex replacements

**Alternatives considered**:
- **Separate preview and execute tools** - More round-trips, complex flow
- **Always require preview** - Slower, unnecessary for simple replacements
- **No preview option** - Riskier, harder to debug agent behavior

### Decision 4: Line-Based Editing for Precision

**What**: Line editing tool operates on line ranges, not full file rewrite.

**Parameters**:
```json
{
  "path": "file/path",
  "operation": "insert|delete|replace",
  "start_line": 10,
  "end_line": 15,
  "content": "new content for replace/insert"
}
```

**Why**:
- More efficient than reading and rewriting entire file
- Clearer intent in agent reasoning ("insert after line 42")
- Safer - limited blast radius for errors
- Better for large files

**Alternatives considered**:
- **Diff-based patching** - More complex, harder for LLM to generate correctly
- **Continue using update_file** - Works but inefficient for small changes

### Decision 5: Tool Categorization in System Prompt

**What**: Tools organized into clear categories when injected into system prompt.

**Categories**:
- **Search & Discovery**: grep, glob, search, list_directory
- **File Reading**: read_file
- **File Writing**: create_file, update_file, append_file, replace_in_file, edit_lines
- **File Management**: delete_file

**Why**:
- Helps LLM understand tool purposes faster
- Reduces cognitive load in tool selection
- Enables future filtering (e.g., "only give agent search tools")
- Better prompt organization

**Alternatives considered**:
- **Flat list** - Harder to navigate as tool count grows
- **Tag-based system** - More flexible but more complex
- **No organization** - Current state, becomes unwieldy

## Architecture

### System Flow (No Changes Required)

**Context Manager Orchestration Flow** (unchanged):
```
User Message
    ↓
ChatContext::send_message (context_manager)
    ↓
ChatContext::process_auto_tool_step (context_manager core method)
    ↓
ToolRuntime::execute_tool (trait interface)
    ↓
ContextToolRuntime::execute_tool (web_service implementation)
    ↓
ToolExecutor::execute_tool (tool_system)
    ↓
Tool::execute (individual tool implementation) ← NEW TOOLS HERE
    ↓
Result flows back through the chain to ChatContext
```

**Key Insight**: We only add new tools at the bottom. Context manager's orchestration logic handles everything else.

### New Tool Implementations

```
crates/tool_system/src/extensions/
├── search/
│   ├── simple_search.rs      (existing, enhanced)
│   ├── grep_search.rs         (NEW)
│   └── glob_search.rs         (NEW)
└── file_operations/
    ├── replace.rs             (NEW)
    └── edit_lines.rs          (NEW)
```

### Tool Definition Pattern

Each tool follows the existing pattern (no architectural changes):

```rust
#[derive(Debug)]
pub struct GrepSearchTool;

#[async_trait]
impl Tool for GrepSearchTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "grep".to_string(),
            description: "Search file contents using regex patterns".to_string(),
            parameters: vec![/* ... */],
            requires_approval: false,
            tool_type: ToolType::AIParameterParsing,
            required_permissions: vec![ToolPermission::ReadFiles],
            // ...
        }
    }

    async fn execute(&self, args: ToolArguments) -> Result<serde_json::Value, ToolError> {
        // Implementation
    }
}

auto_register_tool!(GrepSearchTool);  // Auto-discovery, no manual wiring
```

### Integration with Context Manager

**Zero integration work needed** - tools are automatically:
1. Registered via `auto_register_tool!` macro (discovered at compile-time)
2. Available through `ToolExecutor` (web_service)
3. Accessible via `ToolRuntime` trait (context_manager interface)
4. Orchestrated by `ChatContext::process_auto_tool_step` (existing logic)
5. Included in system prompt by `SystemPromptService`
6. Filtered by agent role permissions (existing `AgentRole::permissions()`)
7. Subject to approval gates (existing `requires_approval` flag)

## Implementation Details

### Grep Search Tool

**Dependencies**: `regex`, `walkdir` or `ignore` (respects .gitignore)

**Algorithm**:
1. Parse regex pattern and options
2. Walk directory tree (with exclusions)
3. For each file:
   - Read content
   - Apply regex search
   - Collect matches with line numbers and context
4. Format results as JSON
5. Limit results to `max_results`

**Error Handling**:
- Invalid regex → ToolError with explanation
- File read errors → Skip file, log warning
- Too many results → Truncate with warning

### Glob Search Tool

**Dependencies**: `globset` or `glob`

**Algorithm**:
1. Parse glob pattern
2. Walk directory tree
3. Match paths against pattern
4. Apply exclusions
5. Return sorted list (alphabetical or by modification time)

**Error Handling**:
- Invalid pattern → ToolError with explanation
- No matches → Success with empty results

### Find and Replace Tool

**Dependencies**: `regex`

**Algorithm**:
1. Read target file
2. Apply find-and-replace (regex or literal)
3. If `preview_only`: Return before/after diff
4. If not preview: Write modified content
5. Return success with change summary

**Error Handling**:
- File not found → ToolError
- Pattern not found → Success with "0 replacements"
- Write failure → ToolError

### Line-Based Edit Tool

**Algorithm**:
1. Read file into lines
2. Validate line range
3. Apply operation:
   - **insert**: Insert content after `start_line`
   - **delete**: Remove lines `start_line` to `end_line`
   - **replace**: Replace lines `start_line` to `end_line` with `content`
4. Write modified lines back to file
5. Return success with line count change

**Error Handling**:
- Invalid line range → ToolError
- File not found → ToolError
- Write failure → ToolError

## Risks / Trade-offs

### Risk: Large Search Results Overwhelming Context

- **Risk**: Grep/glob searches return thousands of results, filling LLM context window
- **Mitigation**:
  - Enforce `max_results` limit (default 50 for grep, 100 for glob)
  - Provide summary statistics ("Found 523 matches, showing first 50")
  - Suggest refinement strategies in tool response

### Risk: Regex Complexity Leading to Errors

- **Risk**: LLM generates invalid or inefficient regex patterns
- **Mitigation**:
  - Validate regex syntax before execution
  - Set timeout for regex matching
  - Provide clear error messages with examples
  - Document common patterns in termination_behavior_doc

### Risk: Replace Tool Making Unintended Changes

- **Risk**: Agent replaces wrong content or makes destructive edits
- **Mitigation**:
  - Requires approval (user reviews before execution)
  - Preview mode shows exact changes
  - Clear logging of what was replaced
  - Encourage agent to use preview first in termination_behavior_doc

### Risk: Line Editing with Incorrect Line Numbers

- **Risk**: Agent references wrong line numbers, especially after file edits
- **Mitigation**:
  - Tool returns updated line count after edit
  - Encourage agent to re-read file after edits if unsure
  - Clear error messages for invalid line ranges

### Trade-off: Tool Proliferation vs. Multi-Purpose Tools

- **Benefit**: Specialized tools (grep vs. glob) are clearer and easier to use
- **Cost**: More tools to fit in system prompt, potentially confusing LLM
- **Verdict**: Acceptable - Clear, focused tools are better than complex multi-mode tools

## Testing Strategy

### Unit Tests (per tool)

- Valid parameter parsing
- Invalid parameter handling
- Edge cases (empty results, large results)
- Error conditions (file not found, permission denied)

### Integration Tests

- Tools work in agent loop context
- Permission filtering works correctly
- Approval gates function as expected
- Results parseable by LLM in next iteration

### End-to-End Tests

- Agent can find code patterns using grep
- Agent can discover files using glob
- Agent can make targeted replacements
- Agent can edit specific lines

## Migration Plan

### Phase 1: Core Search Tools (Week 1)

1. Implement `GrepSearchTool` with basic regex search
2. Implement `GlobSearchTool` with glob pattern matching
3. Write unit tests for both
4. Auto-register tools
5. Test in agent loop manually

### Phase 2: Enhanced Editing Tools (Week 1-2)

1. Implement `ReplaceInFileTool` with preview mode
2. Implement `EditLinesTool` with insert/delete/replace
3. Write unit tests for both
4. Test with approval flow

### Phase 3: Tool Organization & Enhancement (Week 2)

1. Update `SimpleSearchTool` with enhanced options
2. Organize tools into categories
3. Update system prompt formatting to show categories
4. Integration testing

### Phase 4: Testing & Documentation (Week 2)

1. End-to-end agent loop tests
2. Update tool documentation
3. Performance testing with large codebases
4. Edge case handling refinement

### Rollback Plan

- Tools are additive - can be disabled individually via feature flags
- No changes to existing agent loop or core systems
- If issues found, remove specific tool from registry
- Full removal after confirming no critical issues

## Open Questions

1. **Q**: Should grep search support multi-line regex patterns?
   - **A**: Start with single-line matching, add multi-line if requested

2. **Q**: Should glob support negative patterns (exclusions in pattern itself)?
   - **A**: Yes, use `!pattern` syntax common in glob tools

3. **Q**: Should line editing support undo/history?
   - **A**: No in this phase - rely on version control for undo

4. **Q**: Should we add a "dry run" mode for all editing tools?
   - **A**: Replace tool has preview mode; line edit should show diff in response

5. **Q**: How to handle very large files (>1MB) in grep search?
   - **A**: Set file size limit (configurable), skip files above threshold
