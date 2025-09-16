import OpenAI from 'openai';
import { Message, isToolExecutionResult } from '../types/chat';

export class AIService {
  private client: OpenAI;

  constructor(baseURL: string = 'http://localhost:8080/v1', apiKey: string = 'dummy-key') {
    this.client = new OpenAI({
      baseURL,
      apiKey,
      dangerouslyAllowBrowser: true, // Allow browser usage
    });
  }

  async executePrompt(
    messages: Message[],
    model?: string,
    onChunk?: (chunk: string) => void,
    abortSignal?: AbortSignal
  ): Promise<void> {
    try {
      // Convert our message format to OpenAI format
      const openaiMessages = messages.map(msg => {
        let content;
        if (typeof msg.content === 'string') {
          content = msg.content;
        } else if (isToolExecutionResult(msg.content)) {
          // If it's a tool result, just use the string result for the AI prompt
          content = msg.content.result;
        } else {
          // It's an array of content parts
          content = msg.content.map(part => {
            if (part.type === 'text') {
              return { type: 'text', text: part.text };
            } else if (part.type === 'image_url') {
              return {
                type: 'image_url',
                image_url: {
                  url: part.image_url?.url || '',
                  detail: part.image_url?.detail || 'auto'
                }
              };
            }
            return part;
          });
        }
        return { role: msg.role, content };
      });

      console.log('[AIService] Sending messages:', openaiMessages.length, 'messages');
      console.log('[AIService] Messages:', JSON.stringify(openaiMessages, null, 2));

      if (onChunk) {
        // Streaming response
        const stream = await this.client.chat.completions.create({
          model: model || 'gpt-4.1',
          messages: openaiMessages as any,
          stream: true,
        }, {
          signal: abortSignal,
        });

        for await (const chunk of stream) {
          // Check if request was cancelled
          if (abortSignal?.aborted) {
            console.log('[AIService] Request was cancelled');
            break;
          }

          const content = chunk.choices[0]?.delta?.content;
          const finishReason = chunk.choices[0]?.finish_reason;

          if (content) {
            // Convert to Tauri-compatible format
            const tauriFormat = {
              choices: [{
                delta: {
                  content: content,
                  role: chunk.choices[0]?.delta?.role || null
                },
                finish_reason: finishReason || null
              }]
            };
            onChunk(JSON.stringify(tauriFormat));
          }

          // Check if stream is finished
          if (finishReason === 'stop') {
            break;
          }
        }

        // Send completion signal in Tauri format
        if (onChunk) {
          onChunk('[DONE]');
        }
      } else {
        // Non-streaming response - just complete the request
        await this.client.chat.completions.create({
          model: model || 'gpt-4.1',
          messages: openaiMessages as any,
          stream: false,
        }, {
          signal: abortSignal,
        });
      }
    } catch (error) {
      // Handle abort errors gracefully
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('[AIService] Request was aborted');
        if (onChunk) {
          onChunk('[CANCELLED]');
        }
        return; // Don't throw for cancelled requests
      }

      console.error('AI Service Error:', error);
      if (onChunk) {
        onChunk(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      throw error;
    }
  }

  async getModels(): Promise<string[]> {
    try {
      const response = await this.client.models.list();
      const models = response.data.map(model => model.id);
      if (models.length === 0) {
        console.warn('AI service returned empty model list, using fallback');
        return ['gpt-4.1', 'gpt-4', 'gpt-3.5-turbo'];
      }
      return models;
    } catch (error) {
      console.error('Failed to get models from AI service:', error);
      console.log('Using fallback models. Make sure the web service is running on localhost:8080');
      // Fallback to default models when service is not available
      return ['gpt-4.1', 'gpt-4', 'gpt-3.5-turbo'];
    }
  }
}
