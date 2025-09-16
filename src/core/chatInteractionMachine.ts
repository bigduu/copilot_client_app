import { setup, assign, fromPromise, fromCallback } from 'xstate';
import { AIService } from '../services/AIService';
import { ToolService, ToolCallRequest, ParameterValue, ToolUIInfo } from '../services/ToolService';
import { Message, ToolExecutionResult, ChatItem, SystemPromptPreset, isToolExecutionResult } from '../types/chat';
import SystemPromptEnhancer from '../services/SystemPromptEnhancer';

// Create single instances of services
const aiService = new AIService();
const toolService = ToolService.getInstance();

// 1. 定义状态机的 Context
// 这里存放所有状态需要共享的数据
export interface ChatMachineContext {
  messages: Message[];
  streamingContent: string;
  finalContent: string;
  toolCallRequest?: ToolCallRequest; // Changed to a structured object
  parsedParameters: ParameterValue[] | null;
  error?: Error | null;
}

// 2. 定义状态机可以接收的事件
export type ChatMachineEvent =
  | {
      type: 'USER_SUBMITS';
      payload: {
        messages: Message[];
        chat: ChatItem;
      };
    }
  | { type: 'USER_INVOKES_TOOL'; payload: { request: ToolCallRequest; messages: Message[] } }
  | { type: 'CHUNK_RECEIVED'; payload: { chunk: string } }
  | { type: 'STREAM_COMPLETE_TEXT'; payload: { finalContent: string } }
  | { type: 'STREAM_COMPLETE_TOOL_CALL'; payload: { toolCall: ToolCallRequest } }
  | { type: 'STREAM_ERROR'; payload: { error: Error } }
  | { type: 'PARSING_SUCCESS'; payload: { parameters: ParameterValue[] } }
  | { type: 'PARSING_FAILURE'; payload: { error: Error } }
  | { type: 'USER_APPROVES' }
  | { type: 'USER_REJECTS' }
  | { type: 'TOOL_EXECUTION_SUCCESS'; payload: { result: string } }
  | { type: 'TOOL_EXECUTION_FAILURE'; payload: { error: Error } }
  | { type: 'CANCEL' };

// 3. 创建状态机
export const chatMachine = setup({
  types: {
    context: {} as ChatMachineContext,
    events: {} as ChatMachineEvent,
  },
  actions: {
    persistMessages: () => {}, // Placeholder, implementation is in the hook
  },
  actors: {
    enhanceSystemPrompt: fromPromise<string, { chat: ChatItem }>(async ({ input }) => {
      console.log('[ChatMachine] enhanceSystemPrompt: Actor started with chat:', input.chat);
      const enhancedPrompt = await SystemPromptEnhancer.getEnhancedSystemPrompt(input.chat);
      console.log('[ChatMachine] enhanceSystemPrompt: Prompt enhanced successfully.');
      return enhancedPrompt;
    }),
    aiStream: fromCallback<ChatMachineEvent, { messages: Message[] }>(({ sendBack, input }) => {
      const controller = new AbortController();
      let fullContent = '';

      // New: Prepare messages for the AI service
      const messagesForAI = input.messages.map(msg => {
        if (isToolExecutionResult(msg.content)) {
          // If the content is a tool result object, replace it with the plain text result.
          return { ...msg, content: msg.content.result };
        }
        return msg;
      });

      const onChunk = async (chunk: string) => {
        if (chunk === '[DONE]') {
          const basicToolCall = toolService.parseAIResponseToToolCall(fullContent);
          if (basicToolCall) {
            // Enhance the tool call with full info
            const toolInfo = await toolService.getToolInfo(basicToolCall.tool_name);
            const enhancedToolCall: ToolCallRequest = {
              ...basicToolCall,
              parameter_parsing_strategy: toolInfo?.parameter_parsing_strategy,
            };
            sendBack({ type: 'STREAM_COMPLETE_TOOL_CALL', payload: { toolCall: enhancedToolCall } });
          } else {
            sendBack({ type: 'STREAM_COMPLETE_TEXT', payload: { finalContent: fullContent } });
          }
          return;
        }
        if (chunk === '[CANCELLED]') {
          // The abort signal will handle the cleanup
          return;
        }
        
        try {
          const parsed = JSON.parse(chunk);
          const content = parsed.choices[0]?.delta?.content;
          if (content) {
            fullContent += content;
            sendBack({ type: 'CHUNK_RECEIVED', payload: { chunk: content } });
          }
        } catch (e) {
          console.error("Failed to parse AI chunk:", e);
          // Potentially send an error back to the machine
        }
      };

      // Use the transformed messages
      aiService.executePrompt(messagesForAI, undefined, onChunk, controller.signal)
        .catch((error) => {
          if (error.name !== 'AbortError') {
            sendBack({ type: 'STREAM_ERROR', payload: { error } });
          }
        });

      return () => {
        controller.abort();
      };
    }),
    checkToolApproval: fromPromise<boolean, { toolName: string }>(async ({ input }) => {
      console.log(`[ChatMachine] checkToolApproval: Checking approval for tool: "${input.toolName}"`);
      const requiresApproval = await toolService.toolRequiresApproval(input.toolName);
      console.log(`[ChatMachine] checkToolApproval: Tool "${input.toolName}" requires approval: ${requiresApproval}`);
      return requiresApproval;
    }),
    toolExecutor: fromPromise<ToolExecutionResult, { tool_name: string, parameters: ParameterValue[] }>(async ({ input }) => {
      console.log('[ChatMachine] toolExecutor: Actor started with input:', input);
      const { tool_name, parameters } = input;
      if (!tool_name || !parameters) {
        throw new Error("Tool executor actor received invalid input.");
      }

      const executionRequest = { tool_name, parameters };
      console.log(`[ChatMachine] toolExecutor: Calling toolService.executeTool with:`, executionRequest);
      
      // The service now returns a structured result.
      const structuredResult = await toolService.executeTool(executionRequest);
      console.log(`[ChatMachine] toolExecutor: toolService.executeTool returned:`, structuredResult);

      // The actor now returns the entire structured result object.
      return structuredResult;
    }),
    parameterParser: fromPromise<ParameterValue[], { toolCallRequest: ToolCallRequest }>(async ({ input }) => {
      console.log('[ChatMachine] parameterParser: Actor started with input:', input);
      if (!input.toolCallRequest) {
        throw new Error("Parameter parser actor received no tool call request.");
      }
      const parsedParameters = await toolService.parseParametersWithAI(input.toolCallRequest);
      console.log('[ChatMachine] parameterParser: AI parsing successful, result:', parsedParameters);
      return parsedParameters;
    }),
  }
}).createMachine({
  id: 'chat',
  initial: 'IDLE',
  context: {
    messages: [],
    streamingContent: '',
    finalContent: '',
    toolCallRequest: undefined,
    parsedParameters: null,
    error: null,
  },
  states: {
    IDLE: {
      entry: () => console.log('[ChatMachine] Entering IDLE state'),
      on: {
        USER_SUBMITS: {
          target: 'PREPARING_PROMPT',
          actions: assign({
            messages: ({ event }) => event.payload.messages,
          }),
        },
        USER_INVOKES_TOOL: {
          target: 'ROUTING_TOOL_CALL',
          actions: assign({
            messages: ({ event }) => event.payload.messages,
            toolCallRequest: ({ event }) => event.payload.request,
          }),
        },
      },
    },
    PREPARING_PROMPT: {
      entry: () => console.log('[ChatMachine] Entering PREPARING_PROMPT state'),
      invoke: {
        id: 'enhanceSystemPrompt',
        src: 'enhanceSystemPrompt',
        input: ({ event }) => ({ chat: (event as any).payload.chat }),
        onDone: {
          target: 'THINKING',
          actions: assign({
            messages: ({ context, event }) => {
              const systemPromptContent = event.output;
              const systemMessage: Message = {
                id: 'system-prompt',
                role: 'system',
                content: systemPromptContent,
                createdAt: new Date().toISOString(),
              };
              const history = context.messages.filter(m => m.role !== 'system');
              return [systemMessage, ...history];
            },
          }),
        },
        onError: {
          target: 'IDLE', // Or a dedicated error state
          actions: assign({
            error: ({ event }) => {
              console.error('[ChatMachine] enhanceSystemPrompt actor failed:', event.error);
              return event.error as Error;
            },
          }),
        },
      },
    },
    CHECKING_APPROVAL: {
      entry: () => console.log('[ChatMachine] Entering CHECKING_APPROVAL state'),
      invoke: {
        id: 'checkToolApproval',
        src: 'checkToolApproval',
        input: ({ context }) => ({ toolName: context.toolCallRequest!.tool_name }),
        onDone: [
          {
            guard: ({ event }) => event.output === true, // If tool requires approval
            target: 'AWAITING_APPROVAL',
            actions: () => console.log('[ChatMachine] Approval required. Transitioning to AWAITING_APPROVAL.'),
          },
          {
            target: 'EXECUTING_TOOL', // If tool does not require approval
            actions: () => console.log('[ChatMachine] Approval not required. Transitioning to EXECUTING_TOOL.'),
          },
        ],
        onError: {
          target: 'IDLE', // Or some error state
           actions: assign({
            error: ({ event }) => {
              console.error('[ChatMachine] checkToolApproval actor failed:', event.error);
              return event.error as Error;
            },
          }),
        }
      }
    },
    THINKING: {
      entry: [
        assign({ streamingContent: '', finalContent: '', error: null }),
        () => console.log('[ChatMachine] Entering THINKING state'),
      ],
      invoke: {
        id: 'aiStream',
        src: 'aiStream',
        input: ({ context }) => ({ messages: context.messages }),
      },
      on: {
        CHUNK_RECEIVED: {
          actions: assign({
            streamingContent: ({ context, event }) => context.streamingContent + event.payload.chunk,
          }),
        },
        STREAM_COMPLETE_TEXT: {
          target: 'IDLE',
          actions: [
            assign({
              finalContent: ({ event }) => event.payload.finalContent,
              streamingContent: '', // Clear streaming content
              messages: ({ context, event }) => [
                ...context.messages,
                {
                  id: crypto.randomUUID(),
                  role: 'assistant',
                  content: event.payload.finalContent,
                  createdAt: new Date().toISOString(),
                } as Message,
              ],
            }),
            'persistMessages', // We still need to signal that the process is complete
          ],
        },
        STREAM_COMPLETE_TOOL_CALL: {
          target: 'ROUTING_TOOL_CALL',
          actions: assign({
            toolCallRequest: ({ event }) => event.payload.toolCall,
            // Also add the tool call request as a message
            messages: ({ context, event }) => [
              ...context.messages,
              {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: `/` + event.payload.toolCall.tool_name + ' ' + event.payload.toolCall.user_description,
                createdAt: new Date().toISOString(),
              } as Message,
            ]
          }),
        },
        STREAM_ERROR: {
          target: 'IDLE',
          actions: [
            assign({ 
              error: ({ event }) => event.payload.error,
              messages: ({ context, event }) => [
                ...context.messages,
                {
                  id: crypto.randomUUID(),
                  role: 'assistant',
                  content: `Error: ${(event.payload.error as Error).message}`,
                  createdAt: new Date().toISOString(),
                } as Message,
              ],
            }),
            'persistMessages', // Trigger the side effect
          ],
        },
        CANCEL: {
          target: 'IDLE',
          actions: assign({
            messages: [],
            streamingContent: '',
            finalContent: '',
            toolCallRequest: undefined,
            error: null,
          }),
        },
      },
    },
    ROUTING_TOOL_CALL: {
      entry: () => console.log('[ChatMachine] Entering ROUTING_TOOL_CALL state'),
      always: [
        {
          guard: ({ context }) => {
            // This guard needs to be synchronous. We can't await here.
            // The logic needs to be moved to an action or another state.
            // For now, we assume the info is already fetched or we route differently.
            // This will be fixed by the ROUTING_TOOL_CALL state.
            return context.toolCallRequest?.parameter_parsing_strategy === 'AIParameterParsing';
          },
          target: 'PARSING_PARAMETERS',
          actions: () => console.log('[ChatMachine] Routing to AI parameter parsing.'),
        },
        {
          target: 'CHECKING_APPROVAL',
          actions: [
            () => console.log('[ChatMachine] Routing directly to approval check.'),
            // If not AI parsing, we construct the parameters from the user_description directly.
            assign({
              parsedParameters: ({ context }) => {
                if (!context.toolCallRequest) return null;
                // This is a simplification for single-parameter regex/no-param tools.
                return [{ name: 'command', value: context.toolCallRequest.user_description }];
              }
            })
          ]
        },
      ],
    },
    PARSING_PARAMETERS: {
      entry: () => console.log('[ChatMachine] Entering PARSING_PARAMETERS state'),
      invoke: {
        id: 'parameterParser',
        src: 'parameterParser',
        input: ({ context }) => ({ toolCallRequest: context.toolCallRequest! }),
        onDone: {
          target: 'CHECKING_APPROVAL',
          actions: assign({
            parsedParameters: ({ event }) => event.output,
          }),
        },
        onError: {
          target: 'THINKING', // Or a specific error state
          actions: assign({
            error: ({ event }) => event.error as Error,
            messages: ({ context, event }) => [
              ...context.messages,
              {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: `Error during parameter parsing: ${(event.error as Error).message}`,
                createdAt: new Date().toISOString(),
              } as Message,
            ],
          }),
        }
      }
    },
    AWAITING_APPROVAL: {
      entry: () => console.log('[ChatMachine] Entering AWAITING_APPROVAL state'),
      on: {
        USER_APPROVES: {
          target: 'EXECUTING_TOOL',
          actions: () => console.log('[ChatMachine] User approved. Transitioning to EXECUTING_TOOL.'),
        },
        USER_REJECTS: {
          target: 'THINKING', // 或者回到 IDLE，这里选择回到 THINKING 告诉 AI 用户拒绝了
          actions: () => console.log('[ChatMachine] User rejected. Transitioning to THINKING.'),
        },
      },
    },
    EXECUTING_TOOL: {
      entry: () => console.log('[ChatMachine] Entering EXECUTING_TOOL state'),
      invoke: {
        id: 'toolExecutor',
        src: 'toolExecutor',
        input: ({ context }) => ({ 
          tool_name: context.toolCallRequest!.tool_name,
          parameters: context.parsedParameters!,
        }),
        onDone: {
          target: 'THINKING',
          actions: assign({
            messages: ({ context, event }) => {
              console.log('[ChatMachine] toolExecutor succeeded, output:', event.output);
              // The event.output is now the ToolExecutionResult object.
              // We will pass this entire object as the content of the new message.
              return [
                ...context.messages,
                {
                  id: crypto.randomUUID(),
                  role: 'assistant', // Or 'tool' if you prefer
                  content: event.output, // Pass the whole object
                  createdAt: new Date().toISOString(),
                } as Message,
              ];
            },
          }),
        },
        onError: {
          target: 'THINKING',
          actions: assign({
            messages: ({ context, event }) => {
              console.error('[ChatMachine] toolExecutor failed, error:', event.error);
              return [
                ...context.messages,
                {
                  id: crypto.randomUUID(),
                  role: 'assistant',
                  content: `Tool error: ${(event.error as Error).message}`,
                  createdAt: new Date().toISOString(),
                } as Message,
              ];
            },
          }),
        },
      },
    },
  },
});
