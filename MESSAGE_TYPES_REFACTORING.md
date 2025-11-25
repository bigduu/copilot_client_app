# Message Types Refactoring Plan

## Overview
Split `message_types.rs` (872 lines) into organized domain-based modules.

## Current Structure Analysis

### Type Categories
1. **Core** - RichMessageType enum (main dispatcher)
2. **Text** - TextMessage, TextFormatting
3. **Streaming** - StreamingResponseMsg, StreamChunk  
4. **Media** - ImageMessage, ImageData, ImageRecognitionMode
5. **Files** - FileRefMessage, FileMetadata
6. **Tools** - ToolRequestMessage, ToolResultMessage, ToolCall, ApprovalStatus, ExecutionStatus
7. **MCP** - MCPToolRequestMsg, MCPToolResultMsg, MCPResourceMessage
8. **Project** - ProjectStructMsg, StructureType, DirectoryNode, FileInfo, DependencyGraph
9. **Workflow** - WorkflowExecMsg, WorkflowStatus
10. **System** - SystemMessage, ProcessingMessage, ControlType, ProcessingStage

## Target Structure

```
crates/context_manager/src/structs/message_types/
├── mod.rs           (~80 lines)  - RichMessageType enum + re-exports
├── text.rs          (~50 lines)  - Text messages & formatting
├── streaming.rs     (~120 lines) - Streaming responses
├── media.rs         (~70 lines)  - Image messages
├── files.rs         (~60 lines)  - File references
├── tools.rs         (~120 lines) - Tool messages
├── mcp.rs           (~110 lines) - MCP messages
├── project.rs       (~150 lines) - Project structure
├── workflow.rs      (~60 lines)  - Workflow execution
└── system.rs        (~90 lines)  - System & processing
```

## Module Breakdown

### 1. **mod.rs** - Core Enum & Re-exports (~80 lines)
- RichMessageType enum definition
- Re-export all public types
- Module-level documentation

### 2. **text.rs** - Text Messages (~50 lines)
- TextMessage struct
- TextFormatting struct
- Constructor methods

### 3. **streaming.rs** - Streaming Responses (~120 lines)
- StreamChunk struct
- StreamingResponseMsg struct
- Chunk management methods
- Statistics calculation

### 4. **media.rs** - Media Messages (~70 lines)
- ImageMessage struct
- ImageData enum
- ImageRecognitionMode enum

### 5. **files.rs** - File References (~60 lines)
- FileRefMessage struct
- FileMetadata struct
- Helper methods

### 6. **tools.rs** - Tool Messages (~120 lines)
- ToolRequestMessage struct
- ToolResultMessage struct
- ToolCall struct
- ApprovalStatus enum
- ExecutionStatus enum
- ErrorDetail struct

### 7. **mcp.rs** - MCP Messages (~110 lines)
- MCPToolRequestMsg struct
- MCPToolResultMsg struct
- MCPResourceMessage struct

### 8. **project.rs** - Project Structure (~150 lines)
- ProjectStructMsg struct
- StructureType enum
- ProjectStructureContent enum
- DirectoryNode struct
- FileInfo struct
- DependencyGraph struct
- Dependency struct
- DependencyType enum

### 9. **workflow.rs** - Workflow Execution (~60 lines)
- WorkflowExecMsg struct
- WorkflowStatus enum

### 10. **system.rs** - System Messages (~90 lines)
- SystemMessage struct
- ProcessingMessage struct
- ControlType enum
- ProcessingStage enum

## Migration Steps

1. ✅ Create `message_types/` directory
2. ⏳ Create `mod.rs` with RichMessageType enum
3. ⏳ Create `text.rs` with text message types
4. ⏳ Create `streaming.rs` with streaming types
5. ⏳ Create `media.rs` with image types
6. ⏳ Create `files.rs` with file reference types
7. ⏳ Create `tools.rs` with tool message types
8. ⏳ Create `mcp.rs` with MCP types
9. ⏳ Create `project.rs` with project structure types
10. ⏳ Create `workflow.rs` with workflow types
11. ⏳ Create `system.rs` with system message types
12. ⏳ Update parent `structs/mod.rs`
13. ⏳ Remove old `message_types.rs`
14. ⏳ Verify compilation
15. ⏳ Run tests

## Benefits

### Organization
- ✅ Clear separation by message domain
- ✅ Easy to find specific message types
- ✅ Logical grouping of related types

### Maintainability
- ✅ Smaller files easier to navigate
- ✅ Changes scoped to relevant modules
- ✅ Better code reviews

### Performance
- ✅ Parallel compilation of modules
- ✅ Faster IDE performance

## Success Criteria
- [ ] All 872 lines split into ~10 focused modules
- [ ] All tests passing
- [ ] No functionality lost
- [ ] Clean compilation
- [ ] Clear module boundaries
