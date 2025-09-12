import { Message } from '../types/chat';
import { serviceFactory } from './ServiceFactory';
import { StreamingResponseHandler } from './StreamingResponseHandler';

/**
 * Unified AI parameter parser for tool calls
 * Extracts the common AI parameter parsing logic used in both useMessages and chatStore
 */
export class AIParameterParser {
  public parse(response: string): { toolName: string; parameters: any } | null {
    try {
      const jsonMatch = response.match(/```json\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        const parsed = JSON.parse(jsonMatch[1]);
        if (parsed.tool_call && parsed.parameters) {
          return {
            toolName: parsed.tool_call,
            parameters: parsed.parameters,
          };
        }
      }
    } catch (e) {
      console.error("Failed to parse AI parameters", e);
    }
    return null;
  }

  /**
   * Create a sendLLMRequest function compatible with ToolCallProcessor
   * This function can be passed to ToolCallProcessor.processToolCall
   * @param model Optional model to use
   * @returns Function that can be used as sendLLMRequest parameter
   */
  static createSendLLMRequestFunction(model?: string) {
    return async (messages: Message[]): Promise<string> => {
      return this.parseParameters(messages, model);
    };
  }

  /**
   * Parse tool call parameters with custom streaming handling
   * @param messages Messages to send to AI
   * @param model Optional model to use
   * @param onChunk Optional callback for streaming chunks
   * @returns Promise that resolves with the complete response
   */
  static async parseParametersWithStreaming(
    messages: Message[],
    model?: string,
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    console.log('[AIParameterParser] Starting parameter parsing with streaming');

    return new Promise((resolve, reject) => {
      const responseAccumulator = { content: '' };

      const callbacks = {
        onContent: onChunk,
        onComplete: (fullResponse: string) => {
          console.log('[AIParameterParser] Parameter parsing completed');
          resolve(fullResponse);
        },
        onCancel: (partialResponse: string) => {
          console.log('[AIParameterParser] Parameter parsing cancelled');
          resolve(partialResponse);
        },
        onError: (error: Error) => {
          console.error('[AIParameterParser] Parameter parsing failed:', error);
          reject(error);
        }
      };

      const handleChunk = (rawMessage: string) => {
        StreamingResponseHandler.handleStreamChunk(rawMessage, callbacks, responseAccumulator);
      };

      serviceFactory.executePrompt(messages, model, handleChunk)
        .then(() => {
          // If no response received through callbacks, resolve with accumulated content
          resolve(responseAccumulator.content);
        })
        .catch(reject);
    });
  }
}
