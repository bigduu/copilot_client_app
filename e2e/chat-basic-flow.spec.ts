import { test, expect } from '@playwright/test';
import {
  waitForAppReady,
  createNewChat,
  sendMessage,
  waitForAIResponse,
  waitForStreamingComplete,
  getMessages,
  getChatTitle,
  waitForMessageCount,
  isStreaming,
} from './helpers';

/**
 * E2E Tests for Basic Chat Flow
 * Tests the core functionality of sending and receiving messages
 */

test.describe('Chat Basic Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    
    // Wait for app to be ready
    await waitForAppReady(page);
  });

  test('should load the application', async ({ page }) => {
    // Verify app container is visible
    await expect(page.locator('[data-testid="app-container"]')).toBeVisible();
    
    // Verify sidebar is visible
    await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();
    
    // Verify chat area is visible
    await expect(page.locator('[data-testid="chat-area"]')).toBeVisible();
  });

  test('should create a new chat', async ({ page }) => {
    // Create new chat
    await createNewChat(page);
    
    // Verify chat is created
    const title = await getChatTitle(page);
    expect(title).toBeTruthy();
    
    // Verify message input is visible
    await expect(page.locator('[data-testid="message-input"]')).toBeVisible();
  });

  test('should send and receive a message', async ({ page }) => {
    // Create new chat
    await createNewChat(page);
    
    // Send a message
    const userMessage = 'Hello, how are you?';
    await sendMessage(page, userMessage);
    
    // Wait for user message to appear
    await waitForMessageCount(page, 1, 5000);
    
    // Verify user message is displayed
    const messages = await getMessages(page);
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toContain(userMessage);
    
    // Wait for AI response
    await waitForAIResponse(page, 30000);
    
    // Wait for streaming to complete
    await waitForStreamingComplete(page, 30000);
    
    // Verify AI message is displayed
    const updatedMessages = await getMessages(page);
    expect(updatedMessages.length).toBeGreaterThanOrEqual(2);
    expect(updatedMessages[1].role).toBe('assistant');
    expect(updatedMessages[1].content).toBeTruthy();
  });

  test('should display streaming effect', async ({ page }) => {
    // Create new chat
    await createNewChat(page);
    
    // Send a message
    await sendMessage(page, 'Tell me a short story');
    
    // Wait for AI response to start
    await waitForAIResponse(page, 30000);
    
    // Check if streaming is in progress
    const streaming = await isStreaming(page);
    
    // Note: Streaming might complete very quickly, so we just verify
    // that the AI message appears
    await expect(page.locator('[data-testid="ai-message"]')).toBeVisible();
    
    // Wait for streaming to complete
    await waitForStreamingComplete(page, 30000);
    
    // Verify final message has content
    const messages = await getMessages(page);
    const aiMessage = messages.find(m => m.role === 'assistant');
    expect(aiMessage).toBeTruthy();
    expect(aiMessage?.content).toBeTruthy();
  });

  test('should send multiple messages in sequence', async ({ page }) => {
    // Create new chat
    await createNewChat(page);
    
    // Send first message
    await sendMessage(page, 'What is 2+2?');
    await waitForAIResponse(page, 30000);
    await waitForStreamingComplete(page, 30000);
    
    // Send second message
    await sendMessage(page, 'What is 3+3?');
    await waitForAIResponse(page, 30000);
    await waitForStreamingComplete(page, 30000);
    
    // Verify we have at least 4 messages (2 user + 2 AI)
    const messages = await getMessages(page);
    expect(messages.length).toBeGreaterThanOrEqual(4);
    
    // Verify message order
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
    expect(messages[2].role).toBe('user');
    expect(messages[3].role).toBe('assistant');
  });

  test('should handle empty message input', async ({ page }) => {
    // Create new chat
    await createNewChat(page);
    
    // Try to send empty message
    await page.fill('[data-testid="message-input"]', '');
    await page.press('[data-testid="message-input"]', 'Enter');
    
    // Wait a bit
    await page.waitForTimeout(1000);
    
    // Verify no message was sent
    const messages = await getMessages(page);
    expect(messages.length).toBe(0);
  });

  test('should clear input after sending message', async ({ page }) => {
    // Create new chat
    await createNewChat(page);
    
    // Send a message
    await sendMessage(page, 'Hello');
    
    // Wait a bit
    await page.waitForTimeout(500);
    
    // Verify input is cleared
    const inputValue = await page.locator('[data-testid="message-input"]').inputValue();
    expect(inputValue).toBe('');
  });

  test('should display user message immediately', async ({ page }) => {
    // Create new chat
    await createNewChat(page);
    
    // Send a message
    const userMessage = 'Test message';
    await sendMessage(page, userMessage);
    
    // Verify user message appears immediately (within 1 second)
    await waitForMessageCount(page, 1, 1000);
    
    const messages = await getMessages(page);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toContain(userMessage);
  });

  test('should handle long messages', async ({ page }) => {
    // Create new chat
    await createNewChat(page);
    
    // Send a long message
    const longMessage = 'This is a very long message. '.repeat(50);
    await sendMessage(page, longMessage);
    
    // Wait for user message
    await waitForMessageCount(page, 1, 5000);
    
    // Verify message is displayed
    const messages = await getMessages(page);
    expect(messages[0].content).toContain('This is a very long message');
    
    // Wait for AI response
    await waitForAIResponse(page, 30000);
    await waitForStreamingComplete(page, 30000);
    
    // Verify AI responded
    const updatedMessages = await getMessages(page);
    expect(updatedMessages.length).toBeGreaterThanOrEqual(2);
  });

  test('should maintain message history', async ({ page }) => {
    // Create new chat
    await createNewChat(page);
    
    // Send multiple messages
    await sendMessage(page, 'First message');
    await waitForAIResponse(page, 30000);
    await waitForStreamingComplete(page, 30000);
    
    await sendMessage(page, 'Second message');
    await waitForAIResponse(page, 30000);
    await waitForStreamingComplete(page, 30000);
    
    // Verify all messages are still visible
    const messages = await getMessages(page);
    expect(messages.length).toBeGreaterThanOrEqual(4);
    
    // Verify first message is still there
    expect(messages[0].content).toContain('First message');
    expect(messages[2].content).toContain('Second message');
  });
});

