/**
 * Unified streaming response handler for AI responses
 * Extracts common JSON parsing and streaming logic used across the application
 */

export interface StreamingCallbacks {
  onContent?: (content: string) => void;
  onComplete?: (fullResponse: string) => void;
  onError?: (error: Error) => void;
  onCancel?: (partialResponse: string) => void;
}

export class StreamingResponseHandler {
  private onContent: (content: string) => void;
  private onComplete: () => void;
  private responseAccumulator = { content: '' };

  constructor(onContent: (content: string) => void, onComplete: () => void) {
    this.onContent = onContent;
    this.onComplete = onComplete;
  }

  public handleChunk(rawMessage: string): void {
    if (rawMessage.trim() === '[DONE]') {
      this.onComplete();
      return;
    }

    // Skip empty messages
    if (!rawMessage || rawMessage.trim() === '') {
      return;
    }

    try {
      const data = JSON.parse(rawMessage);
      if (data.choices && data.choices.length > 0) {
        const content = data.choices[0]?.delta?.content;
        if (content) {
          this.responseAccumulator.content += content;
          this.onContent(content);
        }
      }
    } catch (e) {
      // Not a JSON, treat as plain text
      this.responseAccumulator.content += rawMessage;
      this.onContent(rawMessage);
    }
  }

  /**
   * Create a promise-based streaming handler for AI parameter parsing
   * @param executePrompt Function to execute the prompt
   * @param messages Messages to send
   * @param model Optional model to use
   * @returns Promise that resolves with the complete response
   */
  static createParameterParsingHandler(
    executePrompt: (messages: any[], model?: string, onChunk?: (chunk: string) => void) => Promise<void>,
    messages: any[],
    model?: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const responseAccumulator = { content: '' };

      const callbacks: StreamingCallbacks = {
        onComplete: (fullResponse) => {
          resolve(fullResponse);
        },
        onCancel: (partialResponse) => {
          resolve(partialResponse);
        },
        onError: (error) => {
          reject(error);
        }
      };

      const handleChunk = (rawMessage: string) => {
        this.handleStreamChunk(rawMessage, callbacks, responseAccumulator);
      };

      executePrompt(messages, model, handleChunk)
        .then(() => {
          // If no response received through callbacks, resolve with accumulated content
          resolve(responseAccumulator.content);
        })
        .catch(reject);
    });
  }

  /**
   * Create a throttled streaming handler for UI updates
   * @param onUpdate Function to call for UI updates
   * @param throttleMs Throttle interval in milliseconds
   * @returns Throttled update function
   */
  static createThrottledUpdater(
    onUpdate: (content: string) => void,
    throttleMs: number = 150
  ): (content: string) => void {
    let lastUpdateTime = 0;
    let pendingContent = '';
    let timeoutId: number | null = null;

    return (content: string) => {
      pendingContent = content;
      const now = Date.now();
      const timeSinceLastUpdate = now - lastUpdateTime;

      if (timeSinceLastUpdate > throttleMs) {
        lastUpdateTime = now;
        onUpdate(content);
      } else {
        // Schedule a delayed update if not already scheduled
        if (timeoutId === null) {
          timeoutId = setTimeout(() => {
            onUpdate(pendingContent);
            lastUpdateTime = Date.now();
            timeoutId = null;
          }, throttleMs - timeSinceLastUpdate);
        }
      }
    };
  }

  /**
   * Extract tool call JSON from AI response
   * @param aiResponse AI response text
   * @returns Extracted JSON string or null if not found
   */
  static extractToolCallJson(aiResponse: string): string | null {
    // First try to find JSON in code blocks
    const codeBlockMatch = aiResponse.match(/```json\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
      console.log('[StreamingResponseHandler] Found JSON in code block');
      return codeBlockMatch[1];
    }

    // Try to find JSON without code blocks - look for complete JSON objects
    const jsonMatch = aiResponse.match(/\{[\s\S]*?"tool_call"[\s\S]*?\}/);
    if (jsonMatch) {
      console.log('[StreamingResponseHandler] Found JSON in mixed content');
      return jsonMatch[0];
    }

    // Try direct JSON parsing for pure JSON responses
    try {
      const parsed = JSON.parse(aiResponse.trim());
      if (parsed && typeof parsed === 'object' && parsed.tool_call && Array.isArray(parsed.parameters)) {
        console.log('[StreamingResponseHandler] Found pure JSON response');
        return aiResponse.trim();
      }
    } catch (directParseError) {
      console.log('[StreamingResponseHandler] No tool call JSON found in response');
    }

    return null;
  }

  /**
   * Validate tool call JSON format
   * @param jsonStr JSON string to validate
   * @returns Parsed tool call data or null if invalid
   */
  static validateToolCallJson(jsonStr: string): any | null {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed && typeof parsed === 'object' && parsed.tool_call && parsed.parameters) {
        return parsed;
      }
    } catch (error) {
      console.error('[StreamingResponseHandler] JSON parse error:', error);
    }
    return null;
  }
}
