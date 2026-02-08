# ToolService Hardcode Cleanup Report

## Cleanup Overview

Successfully cleaned up all hardcoded values in `src/services/ToolService.ts`, fully achieving the "Zero Hardcode in Frontend" principle.

## Types of Hardcodes Cleaned

### 1. Tool Name Hardcode Cleanup
**Before Cleanup:**
```typescript
switch (tool.name) {
  case "execute_command":
  case "create_file":
  case "read_file":
  case "delete_file":
  // ... hardcoded tool names
}
```
**After Cleanup:**
- Completely removed hardcoded switch statements for tool names
- All tool processing logic changed to backend-configured rule-driven approach

### 2. Parameter Parsing Rule Hardcode Cleanup
**Before Cleanup:**
```typescript
case "create_file":
  if (trimmedResponse.includes("|||")) {
    // hardcoded separator
  } else {
    // hardcoded fallback values
    parameters.push(
      { name: "path", value: "test.txt" }, // hardcoded default filename
      { name: "content", value: userDescription }
    );
  }
```
**After Cleanup:**
```typescript
// Get tool parameter parsing rules (from backend config)
const config = await this.getToolConfig();
const rule = config.parameterParsingRules[tool.name];

if (!rule) {
  throw new Error(`Parameter parsing rules for tool "${tool.name}" must be obtained from backend config; frontend does not provide hardcoded rules`);
}
```

### 3. Result Formatting Hardcode Cleanup
**Before Cleanup:**
```typescript
switch (toolName) {
  case "execute_command":
    codeLanguage = "bash";
    break;
  case "create_file":
  case "read_file":
    // hardcoded file extension mappings
    switch (ext) {
      case "js":
      case "jsx":
        codeLanguage = "javascript";
        // ... more hardcoded mappings
    }
}
```
**After Cleanup:**
```typescript
// Get tool result formatting rules (from backend config)
const config = await this.getToolConfig();
const formatRule = config.resultFormattingRules[toolName];

if (!formatRule) {
  throw new Error(`Result formatting rules for tool "${toolName}" must be obtained from backend config; frontend does not provide hardcoded formatting logic`);
}
```

### 4. Default Values and Fallback Mechanism Cleanup
**Before Cleanup:**
```typescript
return tools.find((tool) => tool.name === toolName) || null; // default returns null
return true; // default allows all tools
return { isValid: true }; // default validation passes
```
**After Cleanup:**
```typescript
const tool = tools.find((tool) => tool.name === toolName);
if (!tool) {
  throw new Error(`Tool "${toolName}" does not exist; please check if the tool is properly registered in the backend`);
}

// All default behaviors changed to throw explicit errors
if (!systemPromptId) {
  throw new Error("System prompt ID must be provided; default permission configuration cannot be used");
}
```

## New Type Definitions

### ToolConfig Interface
```typescript
export interface ToolConfig {
  parameterParsingRules: Record<string, ToolParameterRule>;
  resultFormattingRules: Record<string, ToolFormatRule>;
  fileExtensionMappings: Record<string, string>;
}

export interface ToolParameterRule {
  separator?: string;
  parameterNames: string[];
  fallbackBehavior?: 'error' | 'use_description';
}

export interface ToolFormatRule {
  codeLanguage: string;
  parameterExtraction?: {
    pathParam?: string;
    filePathParam?: string;
  };
}
```

## Backend Configuration Fields Required

### 1. get_tool_config Command
Backend needs to implement a command returning complete tool configuration:

```rust
// Example configuration structure
{
  "parameterParsingRules": {
    "execute_command": {
      "parameterNames": ["command"],
      "fallbackBehavior": "error"
    },
    "create_file": {
      "separator": "|||",
      "parameterNames": ["path", "content"],
      "fallbackBehavior": "use_description"
    },
    "read_file": {
      "parameterNames": ["path"],
      "fallbackBehavior": "error"
    },
    "delete_file": {
      "parameterNames": ["path"],
      "fallbackBehavior": "error"
    }
  },
  "resultFormattingRules": {
    "execute_command": {
      "codeLanguage": "bash"
    },
    "create_file": {
      "codeLanguage": "text",
      "parameterExtraction": {
        "pathParam": "path"
      }
    },
    "read_file": {
      "codeLanguage": "text",
      "parameterExtraction": {
        "pathParam": "path"
      }
    },
    "list_files": {
      "codeLanguage": "bash"
    }
  },
  "fileExtensionMappings": {
    "js": "javascript",
    "jsx": "javascript",
    "ts": "typescript",
    "tsx": "typescript",
    "py": "python",
    "rs": "rust",
    "json": "json",
    "md": "markdown",
    "html": "html",
    "css": "css",
    "sh": "bash"
  }
}
```

### 2. get_general_mode_config Command
```rust
{
  "allowAllTools": true
}
```

## Modified Method Signatures

The following methods are now asynchronous and require caller adaptation:

1. `formatToolResult()` - now async
2. `buildParameterParsingPrompt()` - now async
3. `parseAIParameterResponse()` - now async

## Strict Error Handling

All hardcoded scenarios now throw explicit errors:

- No default values provided when configuration is missing
- Explicit errors when tools do not exist
- Detailed explanations when permission checks fail
- Backend configuration required when parameter parsing rules are missing

## Verification Results

✅ **Tool Name Hardcodes**: Fully cleaned
✅ **Parameter Parsing Hardcodes**: Fully cleaned
✅ **Result Formatting Hardcodes**: Fully cleaned
✅ **File Extension Mapping Hardcodes**: Fully cleaned
✅ **Default Values and Fallback Mechanisms**: Fully cleaned
✅ **Permission Check Default Behaviors**: Fully cleaned

## Next Steps

1. Backend implements `get_tool_config` command
2. Backend implements `get_general_mode_config` command
3. Backend configures parameter parsing rules for all tools
4. Backend configures result formatting rules for all tools
5. Test frontend strict mode error handling

## Affected Files

- `src/services/ToolService.ts` - Main cleanup file
- `src/services/ToolCallProcessor.ts` - Adapted for async method calls

Through this cleanup, ToolService now fully complies with the "Zero Hardcode in Frontend" principle, with all configuration relying on the backend, ensuring centralized management and dynamic update capabilities.