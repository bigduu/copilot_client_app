/**
 * Test for streaming tool response functionality
 * This file tests the new streaming approval processing feature
 */

import { StreamingToolResultProcessor } from '../services/StreamingToolResultProcessor';
import { ToolCallProcessor } from '../services/ToolCallProcessor';
import { Message } from '../types/chat';

// Mock data for testing
const mockToolCall = {
  tool_name: 'search',
  user_description: 'search for javascript tutorials'
};

const mockToolInfo = {
  name: 'search',
  description: 'Search for information',
  tool_type: 'RegexParameterExtraction' as const,
  parameter_regex: '^/search\\s+(.+)$',
  custom_prompt: 'You are a helpful search assistant. Summarize the search results clearly.'
};

const mockParameters = [
  { name: 'query', value: 'javascript tutorials' }
];

const mockToolResult = `Found 5 results for "javascript tutorials":
1. MDN JavaScript Guide - Comprehensive guide to JavaScript
2. JavaScript.info - Modern JavaScript tutorial
3. FreeCodeCamp - Interactive JavaScript course
4. W3Schools - JavaScript tutorial with examples
5. Codecademy - Learn JavaScript interactively`;

// Mock LLM request function that simulates streaming
const mockSendLLMRequest = async (
  messages: Message[],
  onChunk?: (chunk: string) => void
): Promise<string> => {
  const response = `Based on your search for "javascript tutorials", I found several excellent resources:

**Top Recommendations:**
1. **MDN JavaScript Guide** - The most comprehensive and authoritative resource
2. **JavaScript.info** - Excellent for modern JavaScript features
3. **FreeCodeCamp** - Great for hands-on learning

**Learning Path Suggestion:**
Start with MDN for fundamentals, then move to JavaScript.info for advanced topics, and practice with FreeCodeCamp exercises.

These resources cover everything from basic syntax to advanced concepts like async/await and ES6+ features.`;

  // Simulate streaming by sending chunks
  if (onChunk) {
    const chunks = response.split(' ');
    let accumulated = '';
    
    for (let i = 0; i < chunks.length; i++) {
      accumulated += (i > 0 ? ' ' : '') + chunks[i];
      
      // Simulate streaming delay
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Send chunk in the expected format
      const chunkData = {
        choices: [{
          delta: {
            content: (i > 0 ? ' ' : '') + chunks[i]
          },
          finish_reason: i === chunks.length - 1 ? 'stop' : null
        }]
      };
      
      onChunk(JSON.stringify(chunkData));
    }
    
    // Send final [DONE] signal
    setTimeout(() => onChunk('[DONE]'), 100);
  }
  
  return response;
};

// Test streaming tool result processor
export const testStreamingToolResultProcessor = async () => {
  console.log('=== Testing StreamingToolResultProcessor ===');
  
  let streamingUpdates: string[] = [];
  let isComplete = false;
  
  const onStreamingUpdate = (content: string, complete: boolean) => {
    streamingUpdates.push(content);
    isComplete = complete;
    console.log(`[${complete ? 'COMPLETE' : 'STREAMING'}] ${content.substring(0, 100)}...`);
  };
  
  try {
    const result = await StreamingToolResultProcessor.processWithImmediateDisplay(
      mockToolCall,
      mockToolInfo,
      mockParameters,
      mockToolResult,
      onStreamingUpdate,
      mockSendLLMRequest
    );
    
    console.log('✅ Streaming processing completed');
    console.log(`📊 Total updates: ${streamingUpdates.length}`);
    console.log(`✨ Final result success: ${result.success}`);
    console.log(`📝 Final content length: ${result.content.length}`);
    
    return result;
    
  } catch (error) {
    console.error('❌ Streaming processing failed:', error);
    return null;
  }
};

// Test approval request with streaming
export const testApprovalRequestStreaming = async () => {
  console.log('=== Testing Approval Request Streaming ===');
  
  const approvalRequest = JSON.stringify({
    tool_call: 'search',
    parameters: [{ name: 'query', value: 'javascript tutorials' }],
    approval: true
  }, null, 2);
  
  let streamingUpdates: string[] = [];
  
  const onStreamingUpdate = (content: string, complete: boolean) => {
    streamingUpdates.push(content);
    console.log(`[${complete ? 'COMPLETE' : 'STREAMING'}] ${content.substring(0, 100)}...`);
  };
  
  try {
    const processor = ToolCallProcessor.getInstance();
    
    const result = await processor.processApprovalRequestWithStreaming(
      approvalRequest,
      onStreamingUpdate,
      mockSendLLMRequest
    );
    
    console.log('✅ Approval processing completed');
    console.log(`📊 Total updates: ${streamingUpdates.length}`);
    console.log(`✨ Result success: ${result.success}`);
    console.log(`🔧 Tool name: ${result.toolName}`);
    
    return result;
    
  } catch (error) {
    console.error('❌ Approval processing failed:', error);
    return null;
  }
};

// Test comparison: old vs new approach
export const testComparisonOldVsNew = async () => {
  console.log('=== Testing Old vs New Approach Comparison ===');
  
  const approvalRequest = JSON.stringify({
    tool_call: 'search',
    parameters: [{ name: 'query', value: 'javascript tutorials' }],
    approval: true
  }, null, 2);
  
  console.log('🔄 Testing OLD approach (non-streaming)...');
  const startTimeOld = Date.now();
  
  try {
    const processor = ToolCallProcessor.getInstance();
    const oldResult = await processor.processApprovalRequest(approvalRequest);
    const oldTime = Date.now() - startTimeOld;
    
    console.log(`⏱️ Old approach completed in ${oldTime}ms`);
    console.log(`📝 Old result length: ${oldResult.content.length}`);
  } catch (error) {
    console.error('❌ Old approach failed:', error);
  }
  
  console.log('🚀 Testing NEW approach (streaming)...');
  const startTimeNew = Date.now();
  let firstUpdateTime = 0;
  let updateCount = 0;
  
  const onStreamingUpdate = (content: string, complete: boolean) => {
    updateCount++;
    if (firstUpdateTime === 0) {
      firstUpdateTime = Date.now() - startTimeNew;
    }
    
    if (complete) {
      const totalTime = Date.now() - startTimeNew;
      console.log(`⏱️ New approach: First update in ${firstUpdateTime}ms, completed in ${totalTime}ms`);
      console.log(`📊 Total streaming updates: ${updateCount}`);
      console.log(`📝 Final content length: ${content.length}`);
    }
  };
  
  try {
    const processor = ToolCallProcessor.getInstance();
    await processor.processApprovalRequestWithStreaming(
      approvalRequest,
      onStreamingUpdate,
      mockSendLLMRequest
    );
    
    console.log('✅ Comparison completed');
    
  } catch (error) {
    console.error('❌ New approach failed:', error);
  }
};

// Run all tests
export const runStreamingToolTests = async () => {
  console.log('🧪 Starting Streaming Tool Response Tests...\n');
  
  await testStreamingToolResultProcessor();
  console.log('\n---\n');
  
  await testApprovalRequestStreaming();
  console.log('\n---\n');
  
  await testComparisonOldVsNew();
  console.log('\n✅ All streaming tool tests completed!');
};

// Export for manual testing in browser console
if (typeof window !== 'undefined') {
  (window as any).streamingToolTests = {
    runStreamingToolTests,
    testStreamingToolResultProcessor,
    testApprovalRequestStreaming,
    testComparisonOldVsNew
  };
}
