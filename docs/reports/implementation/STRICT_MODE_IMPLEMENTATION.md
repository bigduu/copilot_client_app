# Strict Mode Validation Logic Implementation Documentation

## Overview

This document describes the `strict_tools_mode` validation logic implemented in the frontend, ensuring users can only send messages in tool call format starting with `/` when in strict mode.

## Implementation Contents

### 1. Type Definitions (`src/types/toolCategory.ts`)

- **ToolCategoryInfo Interface**: Matches backend ToolCategory structure, includes `strict_tools_mode` field
- **MessageValidationResult Interface**: Defines validation result structure
- **ToolCategoryService Class**: Provides validation logic and utility methods

### 2. React Hook (`src/hooks/useToolCategoryValidation.ts`)

Provides the following functions:
- `validateMessage()`: Validates if message meets strict mode requirements
- `isStrictMode()`: Checks if currently in strict mode
- `getStrictModePlaceholder()`: Gets input placeholder for strict mode
- `getStrictModeErrorMessage()`: Gets error message for strict mode

### 3. Backend API (`src-tauri/src/command/tools.rs`)

New command:
- `get_tool_category_info(category_id)`: Gets tool category information by category ID

### 4. Frontend Component Updates

#### MessageInput Component (`src/components/MessageInput/index.tsx`)
- Added `validateMessage` property
- Validates before message sending
- Displays error prompts

#### InputContainer Component (`src/components/InputContainer/index.tsx`)
- Integrated tool category validation logic
- Displays strict mode warning prompts
- Updates input placeholder text
- Passes validation function to MessageInput

## Validation Rules

### Strict Mode Validation Logic

```typescript
function validateMessageForStrictMode(
  message: string,
  categoryInfo: ToolCategoryInfo | null
): MessageValidationResult {
  // If no category info or strict mode not enabled, allow all messages
  if (!categoryInfo || !categoryInfo.strict_tools_mode) {
    return { isValid: true };
  }

  const trimmedMessage = message.trim();

  // In strict mode, messages must start with /
  if (!trimmedMessage.startsWith('/')) {
    return {
      isValid: false,
      errorMessage: `In strict mode, only tool calls are allowed. Please enter tool commands starting with /`
    };
  }

  // Check message length (must have at least tool name)
  if (trimmedMessage.length <= 1) {
    return {
      isValid: false,
      errorMessage: `Please enter a complete tool call command, format: /tool_name parameters`
    };
  }

  return { isValid: true };
}
```

## User Experience

### 1. Visual Cues
- **Strict Mode Warning**: Displays red warning box in strict mode
- **Input Prompt**: Automatically updates placeholder text to prompt user for format requirements
- **Error Messages**: Displays clear error messages when invalid format is entered

### 2. Real-time Validation
- Validates message format when user clicks send or presses Enter
- Blocks message sending and displays error prompt when validation fails
- Does not affect normal use in non-strict mode

## Test Verification

### Test Cases

1. **Non-strict Mode Test**:
   - Normal message: ✅ Allowed to send
   - Tool call: ✅ Allowed to send

2. **Strict Mode Test**:
   - Normal message: ❌ Blocked, displays error prompt
   - `/tool_call`: ✅ Allowed to send
   - `/`: ❌ Blocked, prompts incomplete format
   - `/read_file example.txt`: ✅ Allowed to send

### Running Tests

```typescript
import { runStrictModeTests } from './src/utils/testStrictMode';

// Run in browser console
runStrictModeTests();
```

## Configuration Example

According to backend implementation, the following categories have strict mode enabled:

- **CommandExecutionCategory**: `strict_tools_mode: true`
- **FileOperationsCategory**: `strict_tools_mode: false`
- **GeneralAssistantCategory**: `strict_tools_mode: false`

## Usage Methods

### 1. Using Validation in Components

```typescript
import { useToolCategoryValidation } from '../hooks/useToolCategoryValidation';

function ChatComponent() {
  const { validateMessage, isStrictMode } = useToolCategoryValidation(toolCategory);

  const handleSubmit = (message: string) => {
    const validation = validateMessage(message);
    if (!validation.isValid) {
      showError(validation.errorMessage);
      return;
    }
    // Send message
  };
}
```

### 2. Checking Strict Mode Status

```typescript
if (isStrictMode()) {
  // Display strict mode prompt
  showStrictModeWarning();
}
```

## Technical Points

### 1. Backward Compatibility
- Defaults to allowing all messages if no tool category information
- Existing features are not affected

### 2. Performance Optimization
- Uses React Hook to cache validation logic
- Only calls backend API when necessary

### 3. Error Handling
- Gracefully handles API call failures
- Provides clear user feedback

## Known Issues and Solutions

### ID Mapping Mismatch Issue

**Issue**: Frontend and backend use different tool category IDs
- Frontend uses: `"command_executor"`
- Backend defines: `"command_execution"`

**Solution**:
1. Modify mapping function in [`src/types/toolConfig.ts`](src/types/toolConfig.ts)
2. Modify enum value in [`src/types/chat.ts`](src/types/chat.ts)
3. Ensure consistent ID between frontend and backend: `"command_execution"`

### Cache Issue

**Issue**: Old chat sessions still use cached old IDs
**Solution**: Create new chat sessions to test functionality

## Test Results

✅ **Strict Mode Validation Success**: In command execution category, normal messages are correctly blocked
✅ **Error Prompt Correct**: Displays "In strict mode, only tool calls are allowed. Please enter tool commands starting with /"
✅ **Tool Calls Allowed**: Messages starting with `/` can be sent normally
✅ **Non-strict Mode Normal**: Other categories are not affected

## Summary

Strict mode validation logic has been successfully implemented, ensuring:

✅ Users can only send messages in tool call format in strict mode
✅ Provides clear user interface feedback and error prompts
✅ Does not affect normal use in non-strict mode
✅ Maintains good user experience and performance
✅ Frontend-backend ID mapping consistency

Implementation fully meets task requirements, providing users with a safe and intuitive tool calling experience.

**Important Note**: If validation does not take effect, please create a new chat session for testing to avoid the impact of old data caching.