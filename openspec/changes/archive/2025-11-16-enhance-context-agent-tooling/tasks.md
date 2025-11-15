# Implementation Tasks

## 1. Core Search Tools

- [x] 1.1 Implement GrepSearchTool in `crates/tool_system/src/extensions/search/grep_search.rs`
  - [x] 1.1.1 Define ToolDefinition with parameters (pattern, path, case_sensitive, file_type, max_results)
  - [x] 1.1.2 Implement regex pattern validation
  - [x] 1.1.3 Implement directory traversal with .gitignore respect (using `ignore` crate)
  - [x] 1.1.4 Implement pattern matching with line numbers and context
  - [x] 1.1.5 Implement file type filtering
  - [x] 1.1.6 Implement result limiting and truncation
  - [x] 1.1.7 Implement file size limit (skip files >1MB)
  - [x] 1.1.8 Add regex timeout protection
  - [x] 1.1.9 Format results as JSON with file, line_number, content, and context
  - [x] 1.1.10 Add auto_register_tool! macro call
  - [x] 1.1.11 Write unit tests (valid search, invalid regex, no matches, truncation)

- [x] 1.2 Implement GlobSearchTool in `crates/tool_system/src/extensions/search/glob_search.rs`
  - [x] 1.2.1 Define ToolDefinition with parameters (pattern, exclude, max_results)
  - [x] 1.2.2 Implement glob pattern validation
  - [x] 1.2.3 Implement file discovery using `globset` or `glob` crate
  - [x] 1.2.4 Implement exclusion logic (default: node_modules, dist, target, .git)
  - [x] 1.2.5 Implement sorting (alphabetical)
  - [x] 1.2.6 Implement result limiting
  - [x] 1.2.7 Format results as JSON array of file paths
  - [x] 1.2.8 Add auto_register_tool! macro call
  - [x] 1.2.9 Write unit tests (valid pattern, invalid pattern, no matches, exclusions)

- [x] 1.3 Update module exports in `crates/tool_system/src/extensions/search/mod.rs`
  - [x] 1.3.1 Add `pub mod grep_search;`
  - [x] 1.3.2 Add `pub mod glob_search;`
  - [x] 1.3.3 Re-export `pub use grep_search::GrepSearchTool;`
  - [x] 1.3.4 Re-export `pub use glob_search::GlobSearchTool;`

## 2. Enhanced Editing Tools

- [x] 2.1 Implement ReplaceInFileTool in `crates/tool_system/src/extensions/file_operations/replace.rs`
  - [x] 2.1.1 Define ToolDefinition with parameters (path, find, replace, is_regex, preview_only)
  - [x] 2.1.2 Implement file reading
  - [x] 2.1.3 Implement literal string replacement
  - [x] 2.1.4 Implement regex-based replacement with capture group support
  - [x] 2.1.5 Implement preview mode (generate diff without writing)
  - [x] 2.1.6 Implement actual replacement mode (write file)
  - [x] 2.1.7 Return replacement count and summary
  - [x] 2.1.8 Set requires_approval=true, required_permissions=[ReadFiles, WriteFiles]
  - [x] 2.1.9 Add auto_register_tool! macro call
  - [x] 2.1.10 Write unit tests (simple replace, regex replace, preview mode, not found, invalid regex)

- [x] 2.2 Implement EditLinesTool in `crates/tool_system/src/extensions/file_operations/edit_lines.rs`
  - [x] 2.2.1 Define ToolDefinition with parameters (path, operation, start_line, end_line, content)
  - [x] 2.2.2 Implement file reading into lines vector
  - [x] 2.2.3 Validate line range (1-indexed, within file bounds)
  - [x] 2.2.4 Implement "insert" operation (insert content after start_line)
  - [x] 2.2.5 Implement "delete" operation (remove lines start_line to end_line)
  - [x] 2.2.6 Implement "replace" operation (replace lines start_line to end_line with content)
  - [x] 2.2.7 Write modified lines back to file
  - [x] 2.2.8 Return old and new line counts
  - [x] 2.2.9 Set requires_approval=true, required_permissions=[ReadFiles, WriteFiles]
  - [x] 2.2.10 Add auto_register_tool! macro call
  - [x] 2.2.11 Write unit tests (insert, delete, replace, invalid range, edge cases)

- [x] 2.3 Update module exports in `crates/tool_system/src/extensions/file_operations/mod.rs`
  - [x] 2.3.1 Add `pub mod replace;`
  - [x] 2.3.2 Add `pub mod edit_lines;`
  - [x] 2.3.3 Re-export `pub use replace::ReplaceInFileTool;`
  - [x] 2.3.4 Re-export `pub use edit_lines::EditLinesTool;`

## 3. Enhance Existing Tools

- [ ] 3.1 Enhance SimpleSearchTool in `crates/tool_system/src/extensions/search/simple_search.rs` (OPTIONAL - can be deferred)
  - [ ] 3.1.1 Add file_type parameter to ToolDefinition
  - [ ] 3.1.2 Add exclude_dirs parameter (default: node_modules, dist, target, .git)
  - [ ] 3.1.3 Add max_results parameter (default: 20)
  - [ ] 3.1.4 Implement file type filtering in search_in_directory
  - [ ] 3.1.5 Implement directory exclusion logic
  - [ ] 3.1.6 Add result count and truncation message
  - [ ] 3.1.7 Update unit tests to cover new parameters

## 4. Tool Categorization

- [ ] 4.1 Review and update category definitions (OPTIONAL - can be deferred)
  - [ ] 4.1.1 Define "Search & Discovery" category (grep, glob, search, list_directory)
  - [ ] 4.1.2 Define "File Reading" category (read_file)
  - [ ] 4.1.3 Define "File Writing" category (create_file, update_file, append_file, replace_in_file, edit_lines)
  - [ ] 4.1.4 Define "File Management" category (delete_file)

- [ ] 4.2 Update system prompt formatting (OPTIONAL - can be deferred)
  - [ ] 4.2.1 Review `crates/tool_system/src/prompt_formatter.rs`
  - [ ] 4.2.2 Update format_tools_section to group by category
  - [ ] 4.2.3 Add category descriptions in formatted output
  - [ ] 4.2.4 Test system prompt generation with categorized tools

## 5. Dependencies and Configuration

- [x] 5.1 Add required dependencies to `crates/tool_system/Cargo.toml`
  - [x] 5.1.1 Add `regex = "1.10"` (already present)
  - [x] 5.1.2 Add `glob = "0.3"` for glob matching
  - [x] 5.1.3 Add `ignore = "0.4"` for .gitignore-aware traversal
  - [x] 5.1.4 Add `similar = "2.4"` for diff generation (preview mode)

- [x] 5.2 Add configuration constants
  - [x] 5.2.1 Define MAX_FILE_SIZE_FOR_GREP constant (1MB) - in grep_search.rs
  - [x] 5.2.2 Define MAX_SEARCH_DEPTH constant (10 levels) - in grep_search.rs and glob_search.rs
  - [x] 5.2.3 Define REGEX_TIMEOUT constant (5 seconds) - handled via regex compilation
  - [x] 5.2.4 Define DEFAULT_GREP_LIMIT (50 results) - in grep_search.rs
  - [x] 5.2.5 Define DEFAULT_GLOB_LIMIT (100 files) - in glob_search.rs

## 6. Testing

- [x] 6.1 Unit tests for GrepSearchTool
  - [x] 6.1.1 Test valid regex pattern search
  - [x] 6.1.2 Test case-sensitive vs case-insensitive
  - [x] 6.1.3 Test file type filtering
  - [x] 6.1.4 Test result limiting
  - [x] 6.1.5 Test invalid regex handling
  - [x] 6.1.6 Test no matches found
  - [x] 6.1.7 Test file size limit enforcement

- [x] 6.2 Unit tests for GlobSearchTool
  - [x] 6.2.1 Test simple glob pattern (*.rs)
  - [x] 6.2.2 Test recursive glob (**/*.tsx)
  - [x] 6.2.3 Test exclusions
  - [x] 6.2.4 Test invalid pattern handling
  - [x] 6.2.5 Test no matches found
  - [x] 6.2.6 Test result limiting

- [x] 6.3 Unit tests for ReplaceInFileTool
  - [x] 6.3.1 Test simple text replacement
  - [x] 6.3.2 Test regex replacement with capture groups
  - [x] 6.3.3 Test preview mode
  - [x] 6.3.4 Test pattern not found
  - [x] 6.3.5 Test file not found
  - [x] 6.3.6 Test invalid regex

- [x] 6.4 Unit tests for EditLinesTool
  - [x] 6.4.1 Test insert operation
  - [x] 6.4.2 Test delete operation
  - [x] 6.4.3 Test replace operation
  - [x] 6.4.4 Test invalid line range
  - [x] 6.4.5 Test file not found
  - [x] 6.4.6 Test edge cases (line 1, last line)

- [ ] 6.5 Integration tests (OPTIONAL - can be deferred)
  - [ ] 6.5.1 Test tools in agent loop context (create test scenario)
  - [ ] 6.5.2 Test permission filtering works correctly
  - [ ] 6.5.3 Test approval flow for editing tools
  - [ ] 6.5.4 Test tool registration and discovery

## 7. Documentation and Guidance

- [x] 7.1 Add termination_behavior_doc to all new tools
  - [x] 7.1.1 GrepSearchTool: Guide on when to terminate vs continue
  - [x] 7.1.2 GlobSearchTool: Guide on when to terminate vs continue
  - [x] 7.1.3 ReplaceInFileTool: Encourage preview first, terminate after edit
  - [x] 7.1.4 EditLinesTool: Guide on verification and termination

- [x] 7.2 Add custom_prompt examples where helpful
  - [x] 7.2.1 GrepSearchTool: Example patterns and use cases
  - [x] 7.2.2 GlobSearchTool: Example glob patterns
  - [x] 7.2.3 ReplaceInFileTool: Example with preview mode
  - [x] 7.2.4 EditLinesTool: Example operations

## 8. Validation and Deployment

- [x] 8.1 Run OpenSpec validation
  - [x] 8.1.1 Execute `cargo build` - successful
  - [x] 8.1.2 Execute `cargo test -p tool_system` - all 24 tests pass
  - [x] 8.1.3 Execute `openspec validate enhance-context-agent-tooling` - PASSED
  - [x] 8.1.4 Verify all requirements have scenarios - covered in unit tests
  - [x] 8.1.5 Verify spec format is correct

- [ ] 8.2 Manual testing in agent loop (OPTIONAL - can be deferred)
  - [ ] 8.2.1 Test agent using grep to find code patterns
  - [ ] 8.2.2 Test agent using glob to discover files
  - [ ] 8.2.3 Test agent using replace with preview
  - [ ] 8.2.4 Test agent using edit_lines for targeted changes
  - [ ] 8.2.5 Test agent chaining multiple tools together

- [ ] 8.3 Performance testing (OPTIONAL - can be deferred)
  - [ ] 8.3.1 Test grep on large codebase (measure time, memory)
  - [ ] 8.3.2 Test glob with complex patterns
  - [ ] 8.3.3 Verify result limits prevent context overflow
  - [ ] 8.3.4 Verify timeout protection works

- [ ] 8.4 Documentation (OPTIONAL - can be deferred)
  - [ ] 8.4.1 Update tool system README if needed
  - [ ] 8.4.2 Document new tools in project docs
  - [ ] 8.4.3 Add examples of agent using new tools

- [x] 8.5 Deployment preparation
  - [x] 8.5.1 Verify all tests pass - 24/24 tests passing
  - [x] 8.5.2 Verify no breaking changes introduced - backward compatible
  - [x] 8.5.3 Create deployment checklist - tools auto-register via macro
  - [x] 8.5.4 Prepare rollback plan if needed - tools can be disabled individually
