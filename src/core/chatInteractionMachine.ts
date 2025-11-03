import { setup, assign, fromPromise, fromCallback } from "xstate";
import { AIService } from "../services/AIService";
import {
  ToolService,
  ToolCallRequest,
  ParameterValue,
} from "../services/ToolService";
import {
  Message,
  ToolExecutionResult,
  ChatItem,
  AssistantTextMessage,
  AssistantToolCallMessage,
  AssistantToolResultMessage,
  SystemMessage,
  UserSystemPrompt,
} from "../types/chat";
import { SystemPromptService } from "../services";

// Create single instances of services
const aiService = new AIService();
const toolService = ToolService.getInstance();

// 1. 定义状态机的 Context
// 这里存放所有状态需要共享的数据
export interface ChatMachineContext {
  messages: Message[];
  streamingContent: string;
  finalContent: string;
  // Holds the full request while the tool call is being processed
  toolCallRequest?: ToolCallRequest & { toolCallId: string };
  parsedParameters: ParameterValue[] | null;
  error?: Error | null;
}

// 2. 定义状态机可以接收的事件
export type ChatMachineEvent =
  | {
      type: "USER_SUBMITS";
      payload: {
        messages: Message[];
        chat: ChatItem;
        systemPrompts: UserSystemPrompt[];
      };
    }
  | {
      type: "USER_INVOKES_TOOL";
      payload: { request: ToolCallRequest; messages: Message[] };
    }
  | { type: "CHUNK_RECEIVED"; payload: { chunk: string } }
  | { type: "STREAM_COMPLETE_TEXT"; payload: { finalContent: string } }
  | {
      type: "STREAM_COMPLETE_TOOL_CALL";
      payload: { toolCall: ToolCallRequest & { toolCallId: string } };
    }
  | { type: "STREAM_ERROR"; payload: { error: Error } }
  | { type: "PARSING_SUCCESS"; payload: { parameters: ParameterValue[] } }
  | { type: "PARSING_FAILURE"; payload: { error: Error } }
  | { type: "USER_APPROVES" }
  | { type: "USER_REJECTS" }
  | { type: "TOOL_EXECUTION_SUCCESS"; payload: { result: string } }
  | { type: "TOOL_EXECUTION_FAILURE"; payload: { error: Error } }
  | { type: "CANCEL" };

// 3. 创建状态机
export const chatMachine = setup({
  types: {
    context: {} as ChatMachineContext,
    events: {} as ChatMachineEvent,
  },
  actions: {
    persistMessages: () => {}, // Placeholder, implementation is in the hook
    forwardChunkToUI: () => {}, // Placeholder, implementation is in the hook
    finalizeStreamingMessage: () => {}, // Placeholder, implementation is in the hook
  },
  actors: {
    enhanceSystemPrompt: fromPromise<
      string,
      { chat: ChatItem; systemPrompts: UserSystemPrompt[] }
    >(async ({ input }) => {
      console.log(
        "[ChatMachine] enhanceSystemPrompt: Actor started with chat.config:",
        input.chat.config,
        "and systemPrompts count:",
        input.systemPrompts.length
      );

      const { systemPromptId } = input.chat.config;
      const currentPrompt = systemPromptId
        ? input.systemPrompts.find((p) => p.id === systemPromptId)
        : undefined;

      // Use the dynamic prompt content if found, otherwise fall back.
      const basePrompt =
        currentPrompt?.content ?? input.chat.config.baseSystemPrompt ?? "";

      console.log(
        `[ChatMachine] enhanceSystemPrompt: Using basePrompt: "${basePrompt}"`
      );

      // Get the prompt ID if available, otherwise fall back to content-based enhancement
      const systemPromptService = SystemPromptService.getInstance();
      const enhancedPrompt = systemPromptId
        ? await systemPromptService.getEnhancedSystemPrompt(systemPromptId)
        : await systemPromptService.getEnhancedSystemPromptFromContent(
            basePrompt
          );

      console.log(
        "[ChatMachine] enhanceSystemPrompt: Prompt enhanced successfully."
      );
      return enhancedPrompt;
    }),
    aiStream: fromCallback<ChatMachineEvent, { messages: Message[] }>(
      ({ sendBack, input }) => {
        const controller = new AbortController();
        let fullContent = "";

        // The AIService now handles the message conversion.
        const messagesForAI = input.messages;

        const onChunk = async (chunk: string) => {
          if (chunk === "[DONE]") {
            // NOTE: Tool detection disabled - tools are now handled by backend agent loop
            // Workflows are user-invoked, not AI-invoked
            // The backend will handle JSON tool calls from the LLM autonomously
            sendBack({
              type: "STREAM_COMPLETE_TEXT",
              payload: { finalContent: fullContent },
            });
            return;
          }
          if (chunk === "[CANCELLED]") {
            // The abort signal will handle the cleanup
            return;
          }

          // We simplified the AIService to return raw chunks.
          fullContent += chunk;
          sendBack({ type: "CHUNK_RECEIVED", payload: { chunk } });
        };

        // Use the transformed messages
        aiService
          .executePrompt(messagesForAI, undefined, onChunk, controller.signal)
          .catch((error) => {
            if (error.name !== "AbortError") {
              sendBack({ type: "STREAM_ERROR", payload: { error } });
            }
          });

        return () => {
          controller.abort();
        };
      }
    ),
    // Note: checkToolApproval removed - tool approval is now handled by backend agent loop
    // The backend will send approval requests via ServiceResponse::AwaitingToolApproval
    checkToolApproval: fromPromise<boolean, { toolName: string }>(
      async ({ input: _input }) => {
        console.warn(
          `[ChatMachine] checkToolApproval: This should not be called - approval handled by backend`
        );
        // Default to requiring approval for safety
        return true;
      }
    ),
    toolExecutor: fromPromise<
      ToolExecutionResult,
      { tool_name: string; parameters: ParameterValue[] }
    >(async ({ input }) => {
      console.log(
        "[ChatMachine] toolExecutor: Actor started with input:",
        input
      );
      const { tool_name, parameters } = input;
      if (!tool_name || !parameters) {
        throw new Error("Tool executor actor received invalid input.");
      }

      const executionRequest = { tool_name, parameters };
      console.log(
        `[ChatMachine] toolExecutor: Calling toolService.executeTool with:`,
        executionRequest
      );

      // The service now returns a structured result.
      const structuredResult = await toolService.executeTool(executionRequest);
      console.log(
        `[ChatMachine] toolExecutor: toolService.executeTool returned:`,
        structuredResult
      );

      // The actor now returns the entire structured result object.
      return structuredResult;
    }),
    // Note: parameterParser removed - tool parameter parsing is now handled by backend
    // Tools are called autonomously by LLM with structured JSON format
    // For workflows (user-invoked), parameters should be extracted differently
    parameterParser: fromPromise<
      ParameterValue[],
      { toolCallRequest: ToolCallRequest }
    >(async ({ input }) => {
      console.warn(
        "[ChatMachine] parameterParser: This should not be called for LLM-driven tools"
      );
      if (!input.toolCallRequest) {
        throw new Error(
          "Parameter parser actor received no tool call request."
        );
      }
      // For workflows, return simple parameter extraction
      // This is a fallback for backward compatibility
      return [
        {
          name: "parameter",
          value: input.toolCallRequest.user_description,
        },
      ];
    }),
  },
}).createMachine({
  id: "chat",
  initial: "IDLE",
  context: {
    messages: [],
    streamingContent: "",
    finalContent: "",
    toolCallRequest: undefined,
    parsedParameters: null,
    error: null,
  },
  states: {
    IDLE: {
      entry: () => console.log("[ChatMachine] Entering IDLE state"),
      on: {
        USER_SUBMITS: {
          target: "PREPARING_PROMPT",
          actions: assign({
            messages: ({ event }) => event.payload.messages,
          }),
        },
        USER_INVOKES_TOOL: {
          target: "ROUTING_TOOL_CALL",
          actions: assign({
            messages: ({ event }) => event.payload.messages,
            toolCallRequest: ({ event }) => ({
              ...event.payload.request,
              toolCallId: `call_${crypto.randomUUID()}`, // Add a unique ID
            }),
          }),
        },
      },
    },
    PREPARING_PROMPT: {
      entry: () => console.log("[ChatMachine] Entering PREPARING_PROMPT state"),
      invoke: {
        id: "enhanceSystemPrompt",
        src: "enhanceSystemPrompt",
        input: ({ event }) => {
          const { chat, systemPrompts } = (event as any).payload;
          return { chat, systemPrompts };
        },
        onDone: {
          target: "THINKING",
          actions: assign({
            messages: ({ context, event }) => {
              const systemPromptContent = event.output;
              const systemMessage: SystemMessage = {
                id: "system-prompt",
                role: "system",
                content: systemPromptContent,
                createdAt: new Date().toISOString(),
              };
              const history = context.messages.filter(
                (m) => m.role !== "system"
              );
              return [systemMessage, ...history];
            },
          }),
        },
        onError: {
          target: "IDLE", // Or a dedicated error state
          actions: assign({
            error: ({ event }) => {
              console.error(
                "[ChatMachine] enhanceSystemPrompt actor failed:",
                event.error
              );
              return event.error as Error;
            },
          }),
        },
      },
    },
    CHECKING_APPROVAL: {
      entry: () =>
        console.log("[ChatMachine] Entering CHECKING_APPROVAL state"),
      invoke: {
        id: "checkToolApproval",
        src: "checkToolApproval",
        input: ({ context }) => ({
          toolName: context.toolCallRequest!.tool_name,
        }),
        onDone: [
          {
            guard: ({ event }) => event.output === true, // If tool requires approval
            target: "AWAITING_APPROVAL",
            actions: () =>
              console.log(
                "[ChatMachine] Approval required. Transitioning to AWAITING_APPROVAL."
              ),
          },
          {
            target: "EXECUTING_TOOL", // If tool does not require approval
            actions: () =>
              console.log(
                "[ChatMachine] Approval not required. Transitioning to EXECUTING_TOOL."
              ),
          },
        ],
        onError: {
          target: "IDLE", // Or some error state
          actions: assign({
            error: ({ event }) => {
              console.error(
                "[ChatMachine] checkToolApproval actor failed:",
                event.error
              );
              return event.error as Error;
            },
          }),
        },
      },
    },
    THINKING: {
      entry: [
        assign({ streamingContent: "", finalContent: "", error: null }),
        () => console.log("[ChatMachine] Entering THINKING state"),
      ],
      invoke: {
        id: "aiStream",
        src: "aiStream",
        input: ({ context }) => ({ messages: context.messages }),
      },
      on: {
        CHUNK_RECEIVED: {
          // This action is implemented in the useChatManager hook.
          // It forwards the chunk to the local React state for UI updates
          // without causing a state machine re-render, thus solving the infinite loop.
          actions: "forwardChunkToUI",
        },
        STREAM_COMPLETE_TEXT: {
          target: "IDLE",
          actions: [
            "finalizeStreamingMessage",
            assign({
              finalContent: ({ event }) => event.payload.finalContent,
              streamingContent: "", // Clear streaming content
              // The message is now finalized in the hook, but we still need to add it to the machine's history
              messages: ({ context, event }) => {
                // Find the placeholder message and update it, or add the new one.
                // A simpler approach for now is to just add it. The hook will handle the UI.
                const finalMessage: AssistantTextMessage = {
                  id: crypto.randomUUID(), // This ID will differ from the UI one, which is acceptable
                  role: "assistant",
                  type: "text",
                  content: event.payload.finalContent,
                  createdAt: new Date().toISOString(),
                };
                return [...context.messages, finalMessage];
              },
            }),
            "persistMessages",
          ],
        },
        // Note: STREAM_COMPLETE_TOOL_CALL should no longer occur
        // Tool calls are now parsed and executed by the backend agent loop
        // This event handler is kept for backward compatibility but should be deprecated
        STREAM_COMPLETE_TOOL_CALL: {
          target: "ROUTING_TOOL_CALL",
          actions: [
            () =>
              console.warn(
                "[ChatMachine] STREAM_COMPLETE_TOOL_CALL received - tool calls should be handled by backend"
              ),
            assign({
              toolCallRequest: ({ event }) => event.payload.toolCall,
              messages: ({ context, event }) => {
                const { toolCall } = event.payload;
                const newToolCallMessage: AssistantToolCallMessage = {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  type: "tool_call",
                  createdAt: new Date().toISOString(),
                  toolCalls: [
                    {
                      toolCallId: toolCall.toolCallId,
                      toolName: toolCall.tool_name,
                      // For now, parameters are parsed later. We can store the raw description.
                      parameters: {
                        user_description: toolCall.user_description,
                      },
                    },
                  ],
                };
                return [...context.messages, newToolCallMessage];
              },
            }),
          ],
        },
        STREAM_ERROR: {
          target: "IDLE",
          actions: [
            assign({
              error: ({ event }) => event.payload.error,
              messages: ({ context, event }) => [
                ...context.messages,
                {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  type: "text",
                  content: `Error: ${(event.payload.error as Error).message}`,
                  createdAt: new Date().toISOString(),
                } as AssistantTextMessage,
              ],
            }),
            "persistMessages", // Trigger the side effect
          ],
        },
        CANCEL: {
          target: "IDLE",
          actions: assign({
            messages: [],
            streamingContent: "",
            finalContent: "",
            toolCallRequest: undefined,
            error: null,
          }),
        },
      },
    },
    ROUTING_TOOL_CALL: {
      entry: () =>
        console.log("[ChatMachine] Entering ROUTING_TOOL_CALL state"),
      always: [
        {
          guard: ({ context }) =>
            context.toolCallRequest?.parameter_parsing_strategy ===
            "AIParameterParsing",
          target: "PARSING_PARAMETERS",
          actions: () =>
            console.log("[ChatMachine] Routing to AI parameter parsing."),
        },
        {
          // This is the path for RegexParameterExtraction and other direct tools
          target: "CHECKING_APPROVAL",
          actions: [
            () =>
              console.log(
                "[ChatMachine] Routing directly to approval check for non-AI tool."
              ),
            assign({
              parsedParameters: ({ context }) => {
                if (!context.toolCallRequest) return null;
                // This is a more robust way to handle single-parameter tools.
                // It assumes the first parameter is the one to be filled.
                // A more complex tool would need a different strategy.
                const toolName = context.toolCallRequest.tool_name;
                // This is a synchronous call, which is not ideal.
                // In a future refactor, tool info should be fetched and stored in context earlier.
                // For now, we accept this limitation for simplicity.
                // Let's assume the parameter name is 'command' for execute_command
                if (toolName === "execute_command") {
                  return [
                    {
                      name: "command",
                      value: context.toolCallRequest.user_description,
                    },
                  ];
                }
                // Fallback for other simple tools
                return [
                  {
                    name: "parameter",
                    value: context.toolCallRequest.user_description,
                  },
                ];
              },
            }),
          ],
        },
      ],
    },
    PARSING_PARAMETERS: {
      entry: () =>
        console.log("[ChatMachine] Entering PARSING_PARAMETERS state"),
      invoke: {
        id: "parameterParser",
        src: "parameterParser",
        input: ({ context }) => ({ toolCallRequest: context.toolCallRequest! }),
        onDone: {
          target: "CHECKING_APPROVAL",
          actions: assign({
            parsedParameters: ({ event }) => event.output,
          }),
        },
        onError: {
          target: "THINKING", // Or a specific error state
          actions: assign({
            error: ({ event }) => event.error as Error,
            messages: ({ context, event }) => [
              ...context.messages,
              {
                id: crypto.randomUUID(),
                role: "assistant",
                type: "text",
                content: `Error during parameter parsing: ${
                  (event.error as Error).message
                }`,
                createdAt: new Date().toISOString(),
              } as AssistantTextMessage,
            ],
          }),
        },
      },
    },
    AWAITING_APPROVAL: {
      entry: () =>
        console.log("[ChatMachine] Entering AWAITING_APPROVAL state"),
      on: {
        USER_APPROVES: {
          target: "EXECUTING_TOOL",
          actions: () =>
            console.log(
              "[ChatMachine] User approved. Transitioning to EXECUTING_TOOL."
            ),
        },
        USER_REJECTS: {
          target: "THINKING", // 或者回到 IDLE，这里选择回到 THINKING 告诉 AI 用户拒绝了
          actions: () =>
            console.log(
              "[ChatMachine] User rejected. Transitioning to THINKING."
            ),
        },
      },
    },
    EXECUTING_TOOL: {
      entry: () => console.log("[ChatMachine] Entering EXECUTING_TOOL state"),
      invoke: {
        id: "toolExecutor",
        src: "toolExecutor",
        input: ({ context }) => ({
          tool_name: context.toolCallRequest!.tool_name,
          parameters: context.parsedParameters!,
        }),
        onDone: {
          target: "THINKING",
          actions: assign({
            messages: ({ context, event }) => {
              console.log(
                "[ChatMachine] toolExecutor succeeded, output:",
                event.output
              );
              const toolResult: ToolExecutionResult = event.output;
              const newResultMessage: AssistantToolResultMessage = {
                id: crypto.randomUUID(),
                role: "assistant",
                type: "tool_result",
                toolName: context.toolCallRequest!.tool_name,
                toolCallId: context.toolCallRequest!.toolCallId,
                result: toolResult,
                isError: false,
                createdAt: new Date().toISOString(),
              };
              return [...context.messages, newResultMessage];
            },
          }),
        },
        onError: {
          target: "THINKING",
          actions: assign({
            messages: ({ context, event }) => {
              console.error(
                "[ChatMachine] toolExecutor failed, error:",
                event.error
              );
              const toolResult: ToolExecutionResult = {
                tool_name: context.toolCallRequest!.tool_name,
                result: (event.error as Error).message,
                display_preference: "Default",
              };
              const newResultMessage: AssistantToolResultMessage = {
                id: crypto.randomUUID(),
                role: "assistant",
                type: "tool_result",
                toolName: context.toolCallRequest!.tool_name,
                toolCallId: context.toolCallRequest!.toolCallId,
                result: toolResult,
                isError: true,
                createdAt: new Date().toISOString(),
              };
              return [...context.messages, newResultMessage];
            },
          }),
        },
      },
    },
  },
});
