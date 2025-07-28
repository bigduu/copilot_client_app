/**
 * Simple test to verify the refactored message handling functionality
 * This file can be used to manually test the refactored components
 */

import { StreamingResponseHandler } from '../services/StreamingResponseHandler';
import { AIParameterParser } from '../services/AIParameterParser';
import { MessageHandler } from '../services/MessageHandler';

// Test StreamingResponseHandler
export const testStreamingResponseHandler = () => {
  console.log('Testing StreamingResponseHandler...');
  
  // Test JSON extraction
  const testResponse1 = `Here's the tool call: \`\`\`json
{"tool_call": "search", "parameters": ["test query"]}
\`\`\``;
  
  const testResponse2 = `{"tool_call": "execute", "parameters": ["ls -la"]}`;
  
  const json1 = StreamingResponseHandler.extractToolCallJson(testResponse1);
  const json2 = StreamingResponseHandler.extractToolCallJson(testResponse2);
  
  console.log('JSON extraction test 1:', json1);
  console.log('JSON extraction test 2:', json2);
  
  // Test JSON validation
  if (json1) {
    const validated1 = StreamingResponseHandler.validateToolCallJson(json1);
    console.log('Validation test 1:', validated1);
  }
  
  if (json2) {
    const validated2 = StreamingResponseHandler.validateToolCallJson(json2);
    console.log('Validation test 2:', validated2);
  }
  
  console.log('StreamingResponseHandler tests completed');
};

// Test throttled updater
export const testThrottledUpdater = () => {
  console.log('Testing throttled updater...');
  
  let updateCount = 0;
  const mockUpdate = (content: string) => {
    updateCount++;
    console.log(`Update ${updateCount}: ${content}`);
  };
  
  const throttledUpdater = StreamingResponseHandler.createThrottledUpdater(mockUpdate, 100);
  
  // Simulate rapid updates
  throttledUpdater('content 1');
  throttledUpdater('content 2');
  throttledUpdater('content 3');
  
  setTimeout(() => {
    throttledUpdater('content 4');
    console.log(`Total updates: ${updateCount} (should be less than 4 due to throttling)`);
  }, 200);
};

// Test message handler creation
export const testMessageHandlerCreation = () => {
  console.log('Testing MessageHandler creation...');
  
  const mockChatId = 'test-chat-id';
  const mockAddMessage = (message: any) => {
    console.log('Mock addMessage called:', message);
  };
  const mockInitiateAIResponse = async (chatId: string, content: string) => {
    console.log('Mock initiateAIResponse called:', { chatId, content });
  };
  const mockTriggerAIResponseOnly = async (chatId: string) => {
    console.log('Mock triggerAIResponseOnly called:', { chatId });
  };
  const mockAutoUpdateChatTitle = async (chatId: string) => {
    console.log('Mock autoUpdateChatTitle called:', { chatId });
  };
  
  try {
    const messageHandler = new MessageHandler(
      mockChatId,
      mockAddMessage,
      mockInitiateAIResponse,
      mockTriggerAIResponseOnly,
      mockAutoUpdateChatTitle
    );
    
    console.log('MessageHandler created successfully');
    return messageHandler;
  } catch (error) {
    console.error('MessageHandler creation failed:', error);
    return null;
  }
};

// Run all tests
export const runRefactorTests = () => {
  console.log('=== Starting Refactor Tests ===');
  
  testStreamingResponseHandler();
  console.log('---');
  
  testThrottledUpdater();
  console.log('---');
  
  testMessageHandlerCreation();
  console.log('---');
  
  console.log('=== Refactor Tests Completed ===');
};

// Export for manual testing in browser console
if (typeof window !== 'undefined') {
  (window as any).refactorTests = {
    runRefactorTests,
    testStreamingResponseHandler,
    testThrottledUpdater,
    testMessageHandlerCreation
  };
}
