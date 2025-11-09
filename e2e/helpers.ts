import { Page, expect } from '@playwright/test';

/**
 * E2E Test Helper Functions
 * Provides utilities for testing the chat application
 */

/**
 * Wait for the app to be fully loaded
 */
export async function waitForAppReady(page: Page) {
  // Wait for the main app container to be visible
  await page.waitForSelector('[data-testid="app-container"]', { 
    timeout: 10000,
    state: 'visible' 
  });
  
  // Wait for any loading indicators to disappear
  await page.waitForSelector('[data-testid="loading-indicator"]', { 
    state: 'hidden',
    timeout: 5000 
  }).catch(() => {
    // Loading indicator might not exist, that's ok
  });
}

/**
 * Create a new chat
 */
export async function createNewChat(page: Page, title?: string) {
  // Click new chat button
  await page.click('[data-testid="new-chat-button"]');
  
  // Wait for chat to be created
  await page.waitForTimeout(500);
  
  // If title is provided, update it
  if (title) {
    await page.click('[data-testid="chat-title"]');
    await page.fill('[data-testid="chat-title-input"]', title);
    await page.press('[data-testid="chat-title-input"]', 'Enter');
  }
}

/**
 * Send a message in the current chat
 */
export async function sendMessage(page: Page, message: string) {
  // Fill message input
  await page.fill('[data-testid="message-input"]', message);
  
  // Press Enter to send
  await page.press('[data-testid="message-input"]', 'Enter');
  
  // Wait for message to be sent
  await page.waitForTimeout(500);
}

/**
 * Wait for AI response to appear
 */
export async function waitForAIResponse(page: Page, timeout: number = 30000) {
  // Wait for AI message to appear
  await page.waitForSelector('[data-testid="ai-message"]', {
    timeout,
    state: 'visible'
  });
}

/**
 * Wait for streaming to complete
 */
export async function waitForStreamingComplete(page: Page, timeout: number = 30000) {
  // Wait for streaming indicator to disappear
  await page.waitForSelector('[data-testid="streaming-indicator"]', {
    state: 'hidden',
    timeout
  }).catch(() => {
    // Streaming indicator might not exist, that's ok
  });
  
  // Wait for message to be marked as complete
  await page.waitForSelector('[data-testid="message-complete"]', {
    timeout,
    state: 'visible'
  }).catch(() => {
    // Complete indicator might not exist, that's ok
  });
}

/**
 * Get all messages in the current chat
 */
export async function getMessages(page: Page) {
  const messages = await page.locator('[data-testid="message-item"]').all();
  
  const messageData = [];
  for (const message of messages) {
    const role = await message.getAttribute('data-role');
    const content = await message.locator('[data-testid="message-content"]').textContent();
    messageData.push({ role, content });
  }
  
  return messageData;
}

/**
 * Get the current chat title
 */
export async function getChatTitle(page: Page): Promise<string> {
  const title = await page.locator('[data-testid="chat-title"]').textContent();
  return title || '';
}

/**
 * Select a chat from the sidebar
 */
export async function selectChat(page: Page, chatTitle: string) {
  await page.click(`[data-testid="chat-item"][data-title="${chatTitle}"]`);
  await page.waitForTimeout(500);
}

/**
 * Delete the current chat
 */
export async function deleteCurrentChat(page: Page) {
  // Click delete button
  await page.click('[data-testid="delete-chat-button"]');
  
  // Confirm deletion
  await page.click('[data-testid="confirm-delete-button"]');
  
  // Wait for chat to be deleted
  await page.waitForTimeout(500);
}

/**
 * Pin/unpin the current chat
 */
export async function toggleChatPin(page: Page) {
  await page.click('[data-testid="pin-chat-button"]');
  await page.waitForTimeout(500);
}

/**
 * Get all chat titles from the sidebar
 */
export async function getAllChatTitles(page: Page): Promise<string[]> {
  const chatItems = await page.locator('[data-testid="chat-item"]').all();
  
  const titles = [];
  for (const item of chatItems) {
    const title = await item.getAttribute('data-title');
    if (title) {
      titles.push(title);
    }
  }
  
  return titles;
}

/**
 * Wait for a specific number of messages
 */
export async function waitForMessageCount(page: Page, count: number, timeout: number = 10000) {
  await page.waitForFunction(
    (expectedCount) => {
      const messages = document.querySelectorAll('[data-testid="message-item"]');
      return messages.length === expectedCount;
    },
    count,
    { timeout }
  );
}

/**
 * Check if streaming is in progress
 */
export async function isStreaming(page: Page): Promise<boolean> {
  const streamingIndicator = await page.locator('[data-testid="streaming-indicator"]').count();
  return streamingIndicator > 0;
}

/**
 * Wait for element with retry
 */
export async function waitForElement(
  page: Page, 
  selector: string, 
  options?: { timeout?: number; state?: 'visible' | 'hidden' | 'attached' }
) {
  await page.waitForSelector(selector, {
    timeout: options?.timeout || 10000,
    state: options?.state || 'visible'
  });
}

/**
 * Take a screenshot with a descriptive name
 */
export async function takeScreenshot(page: Page, name: string) {
  await page.screenshot({ 
    path: `e2e/screenshots/${name}.png`,
    fullPage: true 
  });
}

/**
 * Clear all chats (for test cleanup)
 */
export async function clearAllChats(page: Page) {
  const chatTitles = await getAllChatTitles(page);
  
  for (const title of chatTitles) {
    await selectChat(page, title);
    await deleteCurrentChat(page);
  }
}

/**
 * Mock the backend API response
 * Note: This requires the app to expose a way to inject mock responses
 */
export async function mockBackendResponse(page: Page, endpoint: string, response: any) {
  await page.evaluate(
    ({ endpoint, response }) => {
      // @ts-ignore
      if (window.__mockBackend) {
        // @ts-ignore
        window.__mockBackend.mock(endpoint, response);
      }
    },
    { endpoint, response }
  );
}

/**
 * Wait for SSE connection to be established
 */
export async function waitForSSEConnection(page: Page, timeout: number = 5000) {
  await page.waitForFunction(
    () => {
      // @ts-ignore
      return window.__sseConnected === true;
    },
    { timeout }
  ).catch(() => {
    // SSE connection indicator might not exist, that's ok
  });
}

/**
 * Verify message content contains text
 */
export async function verifyMessageContent(page: Page, messageIndex: number, expectedText: string) {
  const messages = await page.locator('[data-testid="message-item"]').all();
  
  if (messageIndex >= messages.length) {
    throw new Error(`Message index ${messageIndex} out of bounds (total: ${messages.length})`);
  }
  
  const content = await messages[messageIndex].locator('[data-testid="message-content"]').textContent();
  expect(content).toContain(expectedText);
}

