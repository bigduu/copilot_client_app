# E2E Tests

End-to-end tests for the Copilot Chat application using Playwright.

## Overview

These E2E tests verify the complete user flow of the application, including:

1. **Basic Chat Flow** (`chat-basic-flow.spec.ts`)
   - Creating new chats
   - Sending and receiving messages
   - Streaming responses
   - Message history

2. **Signal-Pull SSE Architecture** (`signal-pull-sse.spec.ts`)
   - SSE connection establishment
   - Content chunk pulling
   - Event handling (content_delta, message_completed, state_changed)
   - SSE reconnection and cleanup

3. **Chat Management** (`chat-management.spec.ts`)
   - Chat CRUD operations
   - Chat switching
   - Pinning/unpinning chats
   - Title generation
   - Chat deletion

## Prerequisites

1. **Install Playwright browsers** (first time only):
   ```bash
   npx playwright install
   ```

2. **Start the development server**:
   ```bash
   npm run dev
   ```
   
   The app should be running at `http://localhost:1420`

## Running Tests

### Run all E2E tests
```bash
npm run test:e2e
```

### Run tests in UI mode (interactive)
```bash
npm run test:e2e:ui
```

### Run tests in headed mode (see browser)
```bash
npm run test:e2e:headed
```

### Run tests in debug mode
```bash
npm run test:e2e:debug
```

### Run specific test file
```bash
npx playwright test e2e/chat-basic-flow.spec.ts
```

### Run specific test
```bash
npx playwright test -g "should send and receive a message"
```

## Test Structure

### Test Files

- `chat-basic-flow.spec.ts` - Basic chat functionality (10 tests)
- `signal-pull-sse.spec.ts` - SSE architecture tests (9 tests)
- `chat-management.spec.ts` - Chat management tests (13 tests)

**Total**: 32 E2E tests

### Helper Functions

The `helpers.ts` file provides utility functions for common test operations:

- `waitForAppReady()` - Wait for app to load
- `createNewChat()` - Create a new chat
- `sendMessage()` - Send a message
- `waitForAIResponse()` - Wait for AI response
- `waitForStreamingComplete()` - Wait for streaming to finish
- `getMessages()` - Get all messages in current chat
- `getChatTitle()` - Get current chat title
- `selectChat()` - Switch to a different chat
- `deleteCurrentChat()` - Delete current chat
- `toggleChatPin()` - Pin/unpin current chat
- And more...

## Test Data Attributes

The tests rely on `data-testid` attributes in the UI components. Make sure these are present:

### Required data-testid attributes:

**App Structure**:
- `app-container` - Main app container
- `sidebar` - Sidebar container
- `chat-area` - Chat area container
- `loading-indicator` - Loading indicator (optional)

**Chat Management**:
- `new-chat-button` - New chat button
- `chat-item` - Chat item in sidebar (with `data-title` attribute)
- `chat-title` - Current chat title
- `chat-title-input` - Chat title input field
- `delete-chat-button` - Delete chat button
- `confirm-delete-button` - Confirm delete button
- `pin-chat-button` - Pin/unpin button
- `pin-indicator` - Pin indicator icon

**Messages**:
- `message-input` - Message input field
- `message-list` - Message list container
- `message-item` - Individual message (with `data-role` attribute)
- `message-content` - Message content
- `ai-message` - AI message indicator
- `user-message` - User message indicator
- `streaming-indicator` - Streaming in progress indicator
- `message-complete` - Message complete indicator

## Writing New Tests

### Example Test

```typescript
import { test, expect } from '@playwright/test';
import { waitForAppReady, createNewChat, sendMessage } from './helpers';

test.describe('My Feature', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('should do something', async ({ page }) => {
    // Create a new chat
    await createNewChat(page);
    
    // Send a message
    await sendMessage(page, 'Hello');
    
    // Verify something
    await expect(page.locator('[data-testid="message-item"]')).toBeVisible();
  });
});
```

### Best Practices

1. **Use helper functions** - Don't duplicate common operations
2. **Use data-testid** - Don't rely on CSS classes or text content
3. **Wait for elements** - Use `waitFor*` helpers to avoid flaky tests
4. **Clean up** - Tests should be independent and not affect each other
5. **Descriptive names** - Test names should clearly describe what they test
6. **Timeouts** - Use appropriate timeouts for async operations (AI responses can take 30s+)

## Debugging Tests

### View test report
```bash
npx playwright show-report
```

### Run with trace
```bash
npx playwright test --trace on
```

### View trace
```bash
npx playwright show-trace trace.zip
```

### Take screenshots
Tests automatically take screenshots on failure. You can also manually take screenshots:

```typescript
await page.screenshot({ path: 'screenshot.png' });
```

## CI/CD Integration

For CI/CD pipelines, use:

```bash
# Install dependencies
npm ci

# Install Playwright browsers
npx playwright install --with-deps

# Run tests
npm run test:e2e
```

Set `CI=true` environment variable to enable CI-specific settings (retries, parallel execution, etc.).

## Troubleshooting

### Tests are flaky
- Increase timeouts for AI responses (30s+)
- Use `waitFor*` helpers instead of fixed `waitForTimeout`
- Check for race conditions in SSE event handling

### Tests fail to start
- Make sure dev server is running (`npm run dev`)
- Check that port 1420 is available
- Verify Playwright browsers are installed

### SSE tests fail
- Check that backend is running and accessible
- Verify SSE endpoint is correct (`/v1/contexts/{id}/events`)
- Check browser console for SSE connection errors

### Element not found
- Verify `data-testid` attributes are present in components
- Check that element is visible (not hidden by CSS)
- Use `page.locator('[data-testid="..."]').isVisible()` to debug

## Coverage

E2E tests cover:
- ✅ Basic chat functionality (10 tests)
- ✅ Signal-Pull SSE architecture (9 tests)
- ✅ Chat management (13 tests)

**Total**: 32 E2E tests covering core user flows

## Next Steps

1. Add tests for error scenarios
2. Add tests for system prompt selection
3. Add tests for file attachments (if implemented)
4. Add tests for tool calls (if implemented)
5. Add performance tests (response time, etc.)

