import { Message } from '../types/chat';
import { ToolCallRequest, ParameterValue, ToolUIInfo } from '../types/tool';
import { StreamingResponseHandler } from './StreamingResponseHandler';
import { AIParameterParser } from './AIParameterParser';

/**
 * Streaming tool result processor for real-time AI summarization
 * Handles tool execution results with streaming AI responses instead of waiting for completion
 */
export class StreamingToolResultProcessor {
  /**
   * Process tool execution result with streaming AI summarization
   * @param toolCall Original tool call request
   * @param toolInfo Tool information
   * @param parameters Extracted parameters
   * @param toolResult Raw tool execution result
   * @param onStreamingUpdate Callback for streaming updates
   * @param sendLLMRequest Function to send LLM requests
   * @returns Promise that resolves when streaming is complete
   */
  static async processWithStreaming(
    toolCall: ToolCallRequest,
    toolInfo: ToolUIInfo,
    parameters: ParameterValue[],
    toolResult: string,
    onStreamingUpdate: (content: string, isComplete: boolean) => void,
    sendLLMRequest: (messages: Message[], onChunk?: (chunk: string) => void) => Promise<string>
  ): Promise<{ success: boolean; finalContent: string; error?: string }> {
    try {
      // Build AI prompt for tool result summarization
      const systemPrompt = this.buildAIResponsePrompt(toolInfo, toolCall, parameters, toolResult);
      
      const messages: Message[] = [
        {
          role: "system",
          content: systemPrompt,
          id: crypto.randomUUID(),
        },
        {
          role: "user",
          content: toolCall.user_description,
          id: crypto.randomUUID(),
        },
      ];

      let accumulatedContent = '';
      let isComplete = false;

      // Create streaming handler
      const handleChunk = (rawMessage: string) => {
        const responseAccumulator = { content: accumulatedContent };
        
        const callbacks = {
          onContent: (newContent: string) => {
            accumulatedContent += newContent;
            onStreamingUpdate(accumulatedContent, false);
          },
          onComplete: (fullResponse: string) => {
            accumulatedContent = fullResponse;
            isComplete = true;
            onStreamingUpdate(accumulatedContent, true);
          },
          onCancel: (partialResponse: string) => {
            accumulatedContent = partialResponse;
            isComplete = true;
            onStreamingUpdate(accumulatedContent, true);
          },
          onError: (error: Error) => {
            console.error('[StreamingToolResultProcessor] Streaming error:', error);
            isComplete = true;
            onStreamingUpdate(accumulatedContent || `Error: ${error.message}`, true);
          }
        };

        StreamingResponseHandler.handleStreamChunk(rawMessage, callbacks, responseAccumulator);
        accumulatedContent = responseAccumulator.content;
      };

      // Send request with streaming handler
      await sendLLMRequest(messages, handleChunk);

      return {
        success: true,
        finalContent: accumulatedContent
      };

    } catch (error) {
      console.error('[StreamingToolResultProcessor] Processing failed:', error);
      onStreamingUpdate(`Tool result processing failed: ${error}`, true);
      
      return {
        success: false,
        finalContent: '',
        error: `Processing failed: ${error}`
      };
    }
  }

  /**
   * Process tool result with immediate display and streaming AI summary
   * @param toolCall Original tool call request
   * @param toolInfo Tool information
   * @param parameters Extracted parameters
   * @param toolResult Raw tool execution result
   * @param onUpdate Callback for updates
   * @param sendLLMRequest Function to send LLM requests
   * @returns Promise with final result
   */
  static async processWithImmediateDisplay(
    toolCall: ToolCallRequest,
    toolInfo: ToolUIInfo,
    parameters: ParameterValue[],
    toolResult: string,
    onUpdate: (content: string, isComplete: boolean) => void,
    sendLLMRequest: (messages: Message[], onChunk?: (chunk: string) => void) => Promise<string>
  ): Promise<{ success: boolean; content: string }> {
    try {
      // First, show the raw tool result immediately
      const formattedResult = await this.formatToolResult(toolCall.tool_name, parameters, toolResult);
      const immediateContent = `**Tool Execution Result:**\n${formattedResult}\n\n**AI Analysis:**\n`;
      
      onUpdate(immediateContent, false);

      // Then start streaming AI analysis
      let finalContent = immediateContent;
      
      const result = await this.processWithStreaming(
        toolCall,
        toolInfo,
        parameters,
        toolResult,
        (streamingContent, isComplete) => {
          finalContent = immediateContent + streamingContent;
          onUpdate(finalContent, isComplete);
        },
        sendLLMRequest
      );

      return {
        success: result.success,
        content: finalContent
      };

    } catch (error) {
      console.error('[StreamingToolResultProcessor] Immediate display processing failed:', error);
      const errorContent = `Tool execution failed: ${error}`;
      onUpdate(errorContent, true);
      
      return {
        success: false,
        content: errorContent
      };
    }
  }

  /**
   * Build AI response prompt for tool result summarization
   */
  private static buildAIResponsePrompt(
    toolInfo: ToolUIInfo,
    toolCall: ToolCallRequest,
    parameters: ParameterValue[],
    result: string
  ): string {
    // Use tool-provided custom prompt if available
    if (toolInfo.custom_prompt) {
      return `${toolInfo.custom_prompt}

**Tool Execution Details:**
- Tool: ${toolCall.tool_name}
- User Request: ${toolCall.user_description}
- Parameters: ${JSON.stringify(parameters)}
- Raw Result: ${result}`;
    }

    // Default prompt for tool result summarization
    return `You are an AI assistant helping to summarize and explain tool execution results.

**Tool Information:**
- Name: ${toolCall.tool_name}
- Description: ${toolInfo.description || 'No description available'}
- User Request: ${toolCall.user_description}

**Execution Details:**
- Parameters: ${JSON.stringify(parameters)}
- Raw Result: ${result}

Please provide a clear, helpful summary of the tool execution result. Focus on:
1. What the tool did
2. Key findings or results
3. Any important insights or next steps

Be concise but informative. Format your response in a user-friendly way.`;
  }

  /**
   * Format tool result for immediate display
   */
  private static async formatToolResult(
    toolName: string,
    parameters: ParameterValue[],
    result: string
  ): Promise<string> {
    // Simple formatting for immediate display
    const paramStr = parameters.map(p => `${p.name}: ${p.value}`).join(', ');
    
    return `Tool: ${toolName}
Parameters: ${paramStr}
Result: ${result}`;
  }
}
