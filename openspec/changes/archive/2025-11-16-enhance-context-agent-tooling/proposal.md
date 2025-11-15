# Enhance Context Agent Tooling

## Why

The current Context Agent has a functioning multi-round agent loop architecture that allows the agent to autonomously invoke tools and continue processing based on tool results. However, the available toolset is incomplete and limits the agent's ability to effectively interact with the system for common development tasks.

**Current Limitations:**
1. **Search capabilities are minimal** - Only filename-based search exists; no content search (grep/ripgrep) or pattern-based file search (glob)
2. **File editing lacks precision** - Missing find-and-replace functionality and line-based editing capabilities
3. **Limited file manipulation** - No batch operations or advanced file management tools

This prevents the agent from autonomously performing tasks like:
- Finding code patterns across the codebase
- Making targeted replacements in files without rewriting entire content
- Discovering files by pattern (e.g., "all .ts files in src/")
- Navigating and understanding project structure efficiently

## What Changes

### **NEW** Advanced Search Tools

1. **Content Search Tool (Grep)**
   - Search file contents using regex patterns
   - Support for case-sensitive/insensitive search
   - Filter by file type or directory
   - Line number and context reporting
   - Read-only permission (no approval required)

2. **Pattern-Based File Search Tool (Glob)**
   - Find files matching glob patterns (e.g., `**/*.tsx`, `src/**/*.test.ts`)
   - Support exclusions and filters
   - Read-only permission (no approval required)

### **NEW** Enhanced File Editing Tools

1. **Find and Replace Tool**
   - Find and replace text/patterns in a file
   - Support regex patterns
   - Requires approval (modifies files)
   - Preview mode option

2. **Line-Based Edit Tool**
   - Insert, delete, or replace specific line ranges
   - More precise than full file rewrite
   - Requires approval (modifies files)

### **ENHANCED** Existing Search Tool

- Upgrade `SimpleSearchTool` to support both filename and content search modes
- Add filtering options (file types, directories to exclude)
- Improve result formatting and relevance

### **NEW** Tool Categorization

- Organize tools into logical categories for better system prompt organization:
  - **Search & Discovery**: grep, glob, search, list_directory
  - **File Reading**: read_file
  - **File Writing**: create_file, update_file, append_file, replace_in_file, edit_lines
  - **File Management**: delete_file

## Impact

### Affected Specs

- **NEW**: `context-agent-tools` - Comprehensive tooling for Context Agent system interaction

### Affected Code

#### Context Manager (Core System)

- ✅ **No changes required** - `crates/context_manager/` orchestrates everything through existing `ToolRuntime` trait
- ✅ `process_auto_tool_step` handles all tool execution in agent loops
- ✅ Agent loop logic in `ChatContext` remains unchanged
- ✅ State management and approval flows work as-is

**Architecture**: Context Manager is the core that drives all tool execution through the `ToolRuntime` trait interface.

#### Tool System (Tool Implementations)

- `crates/tool_system/src/extensions/search/` - Add new search tools
  - **NEW**: `grep_search.rs` - Content search tool
  - **NEW**: `glob_search.rs` - Pattern-based file search tool
  - **MODIFIED**: `simple_search.rs` - Enhanced search with more options

- `crates/tool_system/src/extensions/file_operations/` - Add new editing tools
  - **NEW**: `replace.rs` - Find and replace tool
  - **NEW**: `edit_lines.rs` - Line-based editing tool

- `crates/tool_system/src/categories/` - Enhanced tool categorization
  - **MODIFIED**: Update category definitions for better organization

#### Web Service (Runtime Bridge)

- ✅ **No changes required** - `ContextToolRuntime` already bridges context manager to tool executor
- ✅ New tools automatically available through existing `ToolExecutor`

#### Frontend (TypeScript)

- ✅ **No changes required** - tools are LLM-invoked and orchestrated by context manager backend

### Breaking Changes

- ❌ No breaking changes
- ✅ Backward compatible - adds new tools alongside existing ones

### Migration Notes

- Existing agent loops continue to work unchanged
- New tools are automatically available to agents after deployment
- No changes required to existing chat contexts or workflows
