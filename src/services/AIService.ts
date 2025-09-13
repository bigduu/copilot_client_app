import OpenAI from 'openai';
import { Message } from '../types/chat';
import { ToolService, ToolCallRequest } from './ToolService';
import { isApprovalRequest } from '../utils/approvalUtils';
export class AIService {
  private client: OpenAI;
  private toolService: ToolService;

  constructor(baseURL: string = 'http://localhost:8080/v1', apiKey: string = 'dummy-key') {
    this.client = new OpenAI({
      baseURL,
      apiKey,
      dangerouslyAllowBrowser: true, // Allow browser usage
    });
    this.toolService = new ToolService();
  }

  //================================================================
  // Tool Call and Approval Request Handling
  //================================================================

  /**
   * Check if message is a tool call
   */
  isToolCall(content: string): boolean {
    return content.startsWith("/");
  }

  /**
   * Check if message is an approval request
   */
  isApprovalRequest(content: string): boolean {
    return isApprovalRequest(content);
  }

  /**
   * Parse tool call
   */
  parseToolCall(content: string): ToolCallRequest | null {
    return this.toolService.parseToolCallFormat(content);
  }

  /**
   * Main entry point for processing user commands (tool calls, etc.)
   */
  async processCommand(
    content: string,
    onUpdate?: (update: any) => void,
  ): Promise<any> {
    const toolCall = this.parseToolCall(content);
    if (!toolCall) {
      throw new Error("Invalid tool call format");
    }

    try {
      onUpdate?.({
        type: "processor_update",
        source: "AIService",
        content: `Processing tool call: /${toolCall.tool_name} ${toolCall.user_description}`,
      });

      const toolInfo = await this.toolService.getToolInfo(toolCall.tool_name);
      if (!toolInfo) {
        return {
          success: false,
          content: `Tool '${toolCall.tool_name}' not found.`,
          toolName: toolCall.tool_name,
          parameters: [],
        };
      }

      let parameters: any[];
      const isRegexTool = toolInfo.tool_type === "RegexParameterExtraction";

      if (isRegexTool) {
        onUpdate?.({
          type: "processor_update",
          source: "AIService",
          content: `Extracting parameters using regex for tool: ${toolCall.tool_name}`,
        });
        parameters = await this.extractParametersWithRegex(toolCall, toolInfo);
      } else {
        onUpdate?.({
          type: "processor_update",
          source: "AIService",
          content: `Analyzing parameters with AI for tool: ${toolCall.tool_name}`,
        });
        
        // This part will be more deeply integrated later.
        // For now, we simulate the AI parsing part.
        parameters = await this.toolService.parseToolParameters(
          toolCall,
          toolInfo,
          (messages: Message[]) => this.executePrompt(messages).then(() => "") // Simplified for now
        );

        return {
          success: true,
          content: "Approval request needed", // Simulate approval request
          toolName: toolCall.tool_name,
          parameters,
        };
      }

      onUpdate?.({
        type: "processor_update",
        source: "AIService",
        content: `Executing tool: ${toolCall.tool_name}`,
      });

      const result = await this.toolService.executeTool({
        tool_name: toolCall.tool_name,
        parameters,
      });

      if (isRegexTool) {
        onUpdate?.({
          type: "processor_update",
          source: "AIService",
          content: `Generating AI summary for regex tool: ${toolCall.tool_name}`,
        });

        const systemPrompt = this.buildAIResponsePrompt(toolInfo, toolCall, parameters, result);
        const messages: Message[] = [
          { role: "system", content: systemPrompt, id: crypto.randomUUID(), createdAt: new Date().toISOString() },
          { role: "user", content: toolCall.user_description, id: crypto.randomUUID(), createdAt: new Date().toISOString() },
        ];
        
        // This will be replaced with a direct streaming call later
        let aiResponse = '';
        await this.executePrompt(messages, undefined, (chunk) => {
          try {
            const parsed = JSON.parse(chunk);
            if (parsed.choices && parsed.choices[0].delta.content) {
              aiResponse += parsed.choices[0].delta.content;
            }
          } catch (e) {
            // ignore
          }
        });

        return {
          success: true,
          content: aiResponse,
          toolName: toolCall.tool_name,
          parameters,
        };

      } else {
        const formattedResult = await this.toolService.formatToolResult(
          toolCall.tool_name,
          parameters,
          result
        );
        return {
          success: true,
          content: formattedResult,
          toolName: toolCall.tool_name,
          parameters,
        };
      }
    } catch (error) {
      console.error("Tool call processing failed:", error);
      return {
        success: false,
        content: `Tool execution failed: ${error}`,
        toolName: toolCall.tool_name,
        parameters: [],
      };
    }
  }

  private buildAIResponsePrompt(
    toolInfo: any,
    toolCall: ToolCallRequest,
    parameters: any[],
    result: string
  ): string {
    const basePrompt = `You are a helpful assistant. I executed the ${
      toolCall.tool_name
    } tool with the following parameters: ${parameters
      .map((p) => `${p.name}: ${p.value}`)
      .join(", ")}.

Result:
${result}

Based on the original request "${
      toolCall.user_description
    }" and the tool execution result above, please provide a helpful summary and explanation.`;

    if (toolInfo.ai_response_template) {
      return `${basePrompt}\n\n${toolInfo.ai_response_template}\n\nDo not include any tool calls (starting with '/') in your response.`;
    }
    return `${basePrompt} Do not include any tool calls (starting with '/') in your response.`;
  }

  private async extractParametersWithRegex(
    toolCall: ToolCallRequest,
    toolInfo: any
  ): Promise<any[]> {
    const fullCommand = `/${toolCall.tool_name} ${toolCall.user_description}`;
    let regex: RegExp;

    if (toolInfo.parameter_regex) {
      regex = new RegExp(toolInfo.parameter_regex);
    } else {
      regex = new RegExp(`^\\/${toolInfo.name}\\s+(.+)$`);
    }

    const match = fullCommand.match(regex);
    if (!match) {
      throw new Error(`Failed to extract parameters from: ${fullCommand}`);
    }

    const parameters: any[] = [];
    if (toolInfo.parameters.length > 0) {
      parameters.push({
        name: toolInfo.parameters[0].name,
        value: match[1].trim(),
      });
    }
    return parameters;
  }

  async executePrompt(
    messages: Message[],
    model?: string,
    onChunk?: (chunk: string) => void,
    abortSignal?: AbortSignal
  ): Promise<void> {
    try {
      // Convert our message format to OpenAI format
      const openaiMessages = messages.map(msg => ({
        role: msg.role,
        content: typeof msg.content === 'string'
          ? msg.content
          : msg.content.map(part => {
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
            })
      }));

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
