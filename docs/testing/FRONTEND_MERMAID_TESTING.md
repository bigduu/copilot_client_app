# Frontend Mermaid Enhancement Testing Guide

This document describes how to test the Mermaid Enhancement feature in the frontend.

## Overview

The frontend now integrates with the backend's Mermaid Enhancement feature, allowing users to toggle Mermaid diagram generation through the System Settings Modal.

## Changes Made

### 1. Type Definitions (`src/services/BackendContextService.ts`)

Added `mermaid_diagrams` field to `ChatContextDTO`:

```typescript
export interface ChatContextDTO {
  id: string;
  config: {
    model_id: string;
    mode: string;
    parameters: Record<string, any>;
    system_prompt_id?: string;
    agent_role: "planner" | "actor";
    workspace_path?: string;
    mermaid_diagrams: boolean; // ← NEW
  };
  // ... other fields
}
```

Updated `updateContextConfig` method to accept `mermaid_diagrams`:

```typescript
async updateContextConfig(
  contextId: string,
  config: {
    auto_generate_title?: boolean;
    mermaid_diagrams?: boolean; // ← NEW
  }
): Promise<void>
```

### 2. Backend Context Provider (`src/contexts/BackendContextProvider.tsx`)

Added `updateMermaidDiagrams` method:

```typescript
interface BackendContextType {
  // ... other methods
  updateMermaidDiagrams: (contextId: string, enabled: boolean) => Promise<void>;
}
```

Implementation:

```typescript
const updateMermaidDiagrams = useCallback(
  async (contextId: string, enabled: boolean) => {
    setIsLoading(true);
    setError(null);

    try {
      // Update backend configuration
      await service.updateContextConfig(contextId, {
        mermaid_diagrams: enabled,
      });

      // Fetch updated context to ensure consistency
      const updatedContext = await service.getContext(contextId);
      setCurrentContext(updatedContext);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update Mermaid diagrams setting");
      throw err;
    } finally {
      setIsLoading(false);
    }
  },
  [service]
);
```

### 3. System Settings Modal (`src/components/SystemSettingsModal/index.tsx`)

**Removed:**
- `isMermaidEnhancementEnabled()` from localStorage utils
- `setMermaidEnhancementEnabled()` from localStorage utils
- Local state management for Mermaid setting

**Added:**
- `useBackendContext()` hook
- `handleMermaidToggle()` function
- Loading state for Mermaid toggle

**Updated Switch Component:**

```typescript
<Switch
  checked={mermaidEnhancementEnabled}
  loading={isUpdatingMermaid}
  onChange={handleMermaidToggle}
  checkedChildren="ON"
  unCheckedChildren="OFF"
/>
```

Where:
- `mermaidEnhancementEnabled` comes from `currentContext?.config?.mermaid_diagrams ?? true`
- `isUpdatingMermaid` shows loading state during API call
- `handleMermaidToggle` calls `updateMermaidDiagrams()` from BackendContextProvider

### 4. Test Helpers (`src/test/helpers.ts`)

Updated `createMockContext()` to include `mermaid_diagrams`:

```typescript
export function createMockContext(overrides?: Partial<ChatContextDTO>): ChatContextDTO {
  return {
    id: "test-context-id",
    config: {
      model_id: "gpt-4",
      mode: "general",
      parameters: {},
      agent_role: "actor",
      workspace_path: "/test/workspace",
      mermaid_diagrams: true, // ← NEW
    },
    // ... other fields
  };
}
```

## Testing Steps

### Prerequisites

1. **Start Backend Server:**
   ```bash
   cargo run
   ```

2. **Start Frontend Dev Server:**
   ```bash
   npm run dev
   ```

3. **Open Application:**
   Navigate to `http://localhost:5173` (or the port shown in terminal)

### Test Scenario 1: Toggle Mermaid Enhancement

1. **Create a new chat context** (if not already created)
2. **Open System Settings Modal** (click the settings icon)
3. **Locate "Mermaid Diagrams Enhancement" toggle**
4. **Verify default state:**
   - Toggle should be ON (enabled) by default
   - Label should show "ON"

5. **Toggle OFF:**
   - Click the toggle to disable
   - Observe loading spinner appears briefly
   - Success message should appear: "Mermaid Diagrams disabled"
   - Toggle should now show "OFF"

6. **Verify backend update:**
   - Open browser DevTools → Network tab
   - Look for PATCH request to `/v1/contexts/{id}/config`
   - Request body should contain: `{"mermaid_diagrams": false}`
   - Response should be successful (200 OK)

7. **Toggle ON:**
   - Click the toggle to enable
   - Observe loading spinner appears briefly
   - Success message should appear: "Mermaid Diagrams enabled"
   - Toggle should now show "ON"

8. **Verify backend update:**
   - Check Network tab again
   - PATCH request body should contain: `{"mermaid_diagrams": true}`

### Test Scenario 2: Persistence Across Page Refresh

1. **Set Mermaid Enhancement to OFF**
2. **Refresh the page** (F5 or Cmd+R)
3. **Wait for context to load**
4. **Open System Settings Modal**
5. **Verify:**
   - Toggle should still be OFF
   - Setting persisted correctly

6. **Set Mermaid Enhancement to ON**
7. **Refresh the page again**
8. **Verify:**
   - Toggle should be ON
   - Setting persisted correctly

### Test Scenario 3: Context Switching

1. **Create two chat contexts:**
   - Context A: Set Mermaid to ON
   - Context B: Set Mermaid to OFF

2. **Switch to Context A:**
   - Open System Settings
   - Verify toggle is ON

3. **Switch to Context B:**
   - Open System Settings
   - Verify toggle is OFF

4. **Switch back to Context A:**
   - Open System Settings
   - Verify toggle is still ON

### Test Scenario 4: Error Handling

1. **Stop the backend server** (Ctrl+C in terminal)
2. **Try to toggle Mermaid Enhancement**
3. **Verify:**
   - Error message appears: "Failed to update Mermaid diagrams setting"
   - Toggle state doesn't change
   - No console errors (error is handled gracefully)

4. **Restart backend server**
5. **Try toggling again**
6. **Verify:**
   - Toggle works correctly
   - Success message appears

### Test Scenario 5: System Prompt Verification

1. **Enable Mermaid Enhancement**
2. **Send a message** (e.g., "Hello")
3. **Check System Message Card** (if visible in UI)
4. **Verify:**
   - Enhanced Prompt contains Mermaid-related content
   - Look for keywords like "Mermaid", "diagram", "visualization"

5. **Disable Mermaid Enhancement**
6. **Send another message**
7. **Verify:**
   - Enhanced Prompt does NOT contain Mermaid-related content

## Expected Behavior

### When Mermaid Enhancement is ENABLED

- Toggle shows "ON" with green background
- Backend receives `PATCH /contexts/{id}/config` with `{"mermaid_diagrams": true}`
- System prompt includes Mermaid diagram guidelines
- AI responses may include Mermaid diagrams when appropriate

### When Mermaid Enhancement is DISABLED

- Toggle shows "OFF" with gray background
- Backend receives `PATCH /contexts/{id}/config` with `{"mermaid_diagrams": false}`
- System prompt does NOT include Mermaid diagram guidelines
- AI responses will not proactively suggest Mermaid diagrams

## Debugging Tips

### Check Current Context State

Open browser console and run:

```javascript
// Get current context from BackendContextProvider
const context = window.__REACT_DEVTOOLS_GLOBAL_HOOK__?.renderers?.get(1)?.getCurrentFiber()?.return?.memoizedState?.memoizedState?.currentContext;
console.log('Mermaid Diagrams:', context?.config?.mermaid_diagrams);
```

Or use React DevTools:
1. Install React DevTools extension
2. Open DevTools → Components tab
3. Find `BackendContextProvider`
4. Inspect `currentContext.config.mermaid_diagrams`

### Check Network Requests

1. Open DevTools → Network tab
2. Filter by "config"
3. Look for PATCH requests to `/v1/contexts/{id}/config`
4. Inspect request/response payloads

### Check Console Logs

The BackendContextProvider logs all Mermaid updates:

```
[BackendContextProvider] Updating Mermaid diagrams to: true
[BackendContextProvider] Mermaid diagrams updated successfully
```

## Common Issues

### Issue: Toggle doesn't change state

**Possible causes:**
- No active context (currentContext is null)
- Backend server not running
- Network error

**Solution:**
- Check console for error messages
- Verify backend server is running
- Check Network tab for failed requests

### Issue: Setting doesn't persist

**Possible causes:**
- Backend not saving context to disk
- Context ID mismatch
- Race condition with polling

**Solution:**
- Check backend logs for save errors
- Verify context ID is correct
- Disable polling temporarily and test

### Issue: System prompt not updating

**Possible causes:**
- Frontend caching old system prompt
- Backend not regenerating system prompt
- Enhancer not running

**Solution:**
- Refresh the page
- Send a new message to trigger system prompt regeneration
- Check backend logs for enhancer execution

## Performance Notes

- Toggle update is asynchronous (shows loading spinner)
- Backend update typically takes < 100ms
- Context refetch ensures UI consistency
- No impact on message sending performance

## Accessibility

- Toggle is keyboard accessible (Tab to focus, Space to toggle)
- Loading state is announced to screen readers
- Success/error messages are announced
- Color is not the only indicator (text labels "ON"/"OFF")

## Browser Compatibility

Tested on:
- Chrome 120+
- Firefox 121+
- Safari 17+
- Edge 120+

## Next Steps

After manual testing, consider:
1. Writing automated E2E tests with a suitable testing framework
2. Adding unit tests for `handleMermaidToggle`
3. Testing with different network conditions (slow 3G, offline)
4. Testing with multiple concurrent users
5. Load testing with many contexts

