# Context Agent Tools Specification

## ADDED Requirements

### Requirement: Content Search with Grep

The system SHALL provide a content search tool that searches file contents using regex patterns.

#### Scenario: Search for code pattern

- **WHEN** agent invokes grep tool with pattern "async fn.*execute"
- **THEN** tool returns list of files and line numbers matching the pattern
- **AND** results include line number and surrounding context
- **AND** results are limited to max_results parameter

#### Scenario: Case-insensitive search

- **WHEN** agent invokes grep with case_sensitive=false
- **THEN** tool performs case-insensitive pattern matching
- **AND** returns all matches regardless of case

#### Scenario: Filter by file type

- **WHEN** agent specifies file_type parameter (e.g., "rs", "ts")
- **THEN** tool only searches files with matching extension
- **AND** ignores files of other types

#### Scenario: No matches found

- **WHEN** pattern matches zero files
- **THEN** tool returns success with empty results
- **AND** includes message indicating no matches

#### Scenario: Invalid regex pattern

- **WHEN** agent provides invalid regex syntax
- **THEN** tool returns ToolError with explanation
- **AND** suggests valid pattern format

### Requirement: Pattern-Based File Search with Glob

The system SHALL provide a file search tool that finds files matching glob patterns.

#### Scenario: Find files by extension

- **WHEN** agent invokes glob with pattern "**/*.tsx"
- **THEN** tool returns all TypeScript React files
- **AND** results are sorted alphabetically
- **AND** results respect exclusions (node_modules, dist, etc.)

#### Scenario: Find test files

- **WHEN** agent uses pattern "src/**/*.test.ts"
- **THEN** tool returns only test files in src directory
- **AND** matches files in nested subdirectories

#### Scenario: Exclude directories

- **WHEN** agent provides exclude parameter ["node_modules", "dist"]
- **THEN** tool skips matching files in excluded directories
- **AND** results only include non-excluded paths

#### Scenario: Invalid glob pattern

- **WHEN** pattern syntax is invalid
- **THEN** tool returns ToolError with explanation
- **AND** suggests valid pattern format

#### Scenario: No matching files

- **WHEN** pattern matches zero files
- **THEN** tool returns success with empty results
- **AND** includes message indicating no matches

### Requirement: Find and Replace in Files

The system SHALL provide a find-and-replace tool for targeted text modifications in files.

#### Scenario: Simple text replacement

- **WHEN** agent invokes replace with find="oldText" and replace="newText"
- **THEN** tool replaces all occurrences in the file
- **AND** returns count of replacements made
- **AND** requires user approval before execution

#### Scenario: Regex-based replacement

- **WHEN** agent uses is_regex=true with pattern and replacement
- **THEN** tool applies regex find-and-replace
- **AND** supports capture groups in replacement
- **AND** returns count of replacements made

#### Scenario: Preview mode

- **WHEN** agent sets preview_only=true
- **THEN** tool returns diff showing proposed changes
- **AND** does NOT modify the file
- **AND** does NOT require approval

#### Scenario: Pattern not found

- **WHEN** find pattern matches zero occurrences
- **THEN** tool returns success with "0 replacements"
- **AND** does NOT modify the file
- **AND** does NOT trigger approval

#### Scenario: File not found

- **WHEN** target file does not exist
- **THEN** tool returns ToolError
- **AND** includes file path in error message

### Requirement: Line-Based File Editing

The system SHALL provide a line-based editing tool for precise file modifications.

#### Scenario: Insert lines

- **WHEN** agent uses operation="insert" at line 10
- **THEN** tool inserts content after line 10
- **AND** existing lines are shifted down
- **AND** returns new total line count
- **AND** requires user approval

#### Scenario: Delete line range

- **WHEN** agent uses operation="delete" with start_line=5, end_line=8
- **THEN** tool removes lines 5 through 8 inclusive
- **AND** remaining lines shift up
- **AND** returns new total line count
- **AND** requires user approval

#### Scenario: Replace line range

- **WHEN** agent uses operation="replace" with start_line=10, end_line=15
- **THEN** tool replaces lines 10-15 with new content
- **AND** returns new total line count
- **AND** requires user approval

#### Scenario: Invalid line range

- **WHEN** start_line or end_line exceeds file length
- **THEN** tool returns ToolError
- **AND** includes valid range in error message

#### Scenario: File not found

- **WHEN** target file does not exist
- **THEN** tool returns ToolError
- **AND** includes file path in error message

### Requirement: Enhanced Simple Search

The system SHALL enhance the existing simple search tool with additional filtering options.

#### Scenario: Search with file type filter

- **WHEN** agent specifies file_type parameter
- **THEN** tool only searches files matching the extension
- **AND** returns matching files sorted by relevance

#### Scenario: Exclude directories

- **WHEN** agent provides exclude_dirs parameter
- **THEN** tool skips specified directories during search
- **AND** returns only results from non-excluded paths

#### Scenario: Limit results

- **WHEN** agent specifies max_results parameter
- **THEN** tool returns at most max_results items
- **AND** includes total count if truncated
- **AND** suggests refinement if many results omitted

### Requirement: Tool Categorization for System Prompt

The system SHALL organize tools into logical categories when formatting for system prompts.

#### Scenario: Search & Discovery category

- **WHEN** system prompt is generated
- **THEN** grep, glob, search, and list_directory tools are grouped under "Search & Discovery"
- **AND** category description explains search capabilities

#### Scenario: File Reading category

- **WHEN** system prompt is generated
- **THEN** read_file tool is grouped under "File Reading"
- **AND** category description explains read-only access

#### Scenario: File Writing category

- **WHEN** system prompt is generated
- **THEN** create_file, update_file, append_file, replace_in_file, and edit_lines are grouped under "File Writing"
- **AND** category description notes approval requirements

#### Scenario: File Management category

- **WHEN** system prompt is generated
- **THEN** delete_file tool is grouped under "File Management"
- **AND** category description emphasizes destructive operations

### Requirement: Tool Permission Declarations

The system SHALL declare appropriate permissions for each tool based on its operations.

#### Scenario: Read-only search tools

- **WHEN** grep, glob, search, list_directory, or read_file is defined
- **THEN** required_permissions includes only ReadFiles
- **AND** requires_approval is false

#### Scenario: Write-access editing tools

- **WHEN** replace_in_file or edit_lines is defined
- **THEN** required_permissions includes ReadFiles and WriteFiles
- **AND** requires_approval is true

#### Scenario: Create/delete operations

- **WHEN** create_file is defined
- **THEN** required_permissions includes CreateFiles
- **WHEN** delete_file is defined
- **THEN** required_permissions includes DeleteFiles
- **AND** both require approval

### Requirement: Search Result Limits

The system SHALL enforce result limits to prevent context overflow in agent loops.

#### Scenario: Grep default limit

- **WHEN** agent invokes grep without max_results
- **THEN** tool defaults to 50 results maximum
- **AND** includes total match count in response
- **AND** suggests refinement if truncated

#### Scenario: Glob default limit

- **WHEN** agent invokes glob without max_results
- **THEN** tool defaults to 100 files maximum
- **AND** includes total file count in response
- **AND** suggests refinement if truncated

#### Scenario: Custom result limit

- **WHEN** agent specifies max_results parameter
- **THEN** tool respects the specified limit
- **AND** applies limit up to configured maximum (e.g., 500)
- **AND** overrides with maximum if requested limit exceeds it

### Requirement: Search Performance and Safety

The system SHALL implement safety measures for search operations.

#### Scenario: File size limits for grep

- **WHEN** grep encounters file larger than size limit (e.g., 1MB)
- **THEN** tool skips the file
- **AND** includes warning in results
- **AND** continues searching other files

#### Scenario: Search depth limits

- **WHEN** directory tree exceeds depth limit (e.g., 10 levels)
- **THEN** tool stops traversing deeper
- **AND** logs warning
- **AND** returns results from searched levels

#### Scenario: Regex timeout protection

- **WHEN** regex pattern takes longer than timeout (e.g., 5 seconds per file)
- **THEN** tool abandons that file
- **AND** includes timeout warning
- **AND** continues with other files

### Requirement: Tool Documentation for LLM Guidance

The system SHALL provide clear termination_behavior_doc for each tool to guide agent usage.

#### Scenario: Search tool guidance

- **WHEN** grep or glob tool is defined
- **THEN** termination_behavior_doc suggests terminate=false if results need further processing
- **AND** suggests terminate=true if presenting results to user

#### Scenario: Edit tool guidance

- **WHEN** replace_in_file or edit_lines is defined
- **THEN** termination_behavior_doc suggests using preview mode first
- **AND** suggests terminate=true after successful edit
- **AND** suggests terminate=false if verification needed

#### Scenario: Parameter examples

- **WHEN** tool definition includes custom_prompt
- **THEN** prompt includes example JSON parameters
- **AND** explains common use cases
- **AND** highlights important options
