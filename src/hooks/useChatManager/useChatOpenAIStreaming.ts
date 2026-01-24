import { useCallback, useRef } from "react";
import { App as AntApp } from "antd";
import { BodhiConfigService } from "../../services/BodhiConfigService";
import { getOpenAIClient } from "../../services/openaiClient";
import { ToolService } from "../../services/ToolService";
import { useAppStore } from "../../store";
import type {
  AssistantTextMessage,
  AssistantToolCallMessage,
  AssistantToolResultMessage,
  Message,
  UserFileReferenceMessage,
  UserMessage,
} from "../../types/chat";
import type { ImageFile } from "../../utils/imageUtils";
import { streamingMessageBus } from "../../utils/streamingMessageBus";
import { getEffectiveSystemPrompt } from "../../utils/systemPromptEnhancement";

export interface UseChatOpenAIStreaming {
  sendMessage: (content: string, images?: ImageFile[]) => Promise<void>;
  cancel: () => void;
}

interface UseChatOpenAIStreamingDeps {
  currentChat: any | null;
  addMessage: (chatId: string, message: any) => Promise<void>;
  setProcessing: (isProcessing: boolean) => void;
}

const buildUserContent = (message: UserMessage) => {
  if (!message.images || message.images.length === 0) {
    return message.content;
  }
  return [
    { type: "text", text: message.content },
    ...message.images.map((img) => ({
      type: "image_url",
      image_url: {
        url: img.base64,
      },
    })),
  ];
};

const mapMessageToOpenAI = (message: Message) => {
  if (message.role === "system") {
    return null;
  }
  if (message.role === "user") {
    const content =
      "content" in message
        ? message.content
        : (message as UserFileReferenceMessage).displayText;
    if (typeof content !== "string") return null;
    const userMessage: UserMessage = {
      id: message.id,
      role: "user",
      content,
      createdAt: message.createdAt,
      images: "images" in message ? message.images : undefined,
    };
    return {
      role: "user",
      content: buildUserContent(userMessage),
    };
  }
  if (message.role === "assistant" && "type" in message) {
    if (message.type === "tool_call") {
      return {
        role: "assistant",
        content: "",
        tool_calls: message.toolCalls.map((call) => ({
          id: call.toolCallId,
          type: "function",
          function: {
            name: call.toolName,
            arguments: JSON.stringify(call.parameters ?? {}),
          },
        })),
      };
    }
    if (message.type === "tool_result") {
      return {
        role: "tool",
        tool_call_id: message.toolCallId,
        content: message.result?.result ?? "",
      };
    }
    if (message.type === "text") {
      return {
        role: "assistant",
        content: message.content,
      };
    }
  }
  return null;
};

export function useChatOpenAIStreaming(
  deps: UseChatOpenAIStreamingDeps,
): UseChatOpenAIStreaming {
  const { modal, message: appMessage } = AntApp.useApp();
  const abortRef = useRef<AbortController | null>(null);
  const toolsCacheRef = useRef<any[] | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const streamingContentRef = useRef<string>("");
  const selectedModel = useAppStore((state) => state.selectedModel);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const resolveTools = useCallback(async () => {
    if (toolsCacheRef.current) return toolsCacheRef.current;
    const configService = BodhiConfigService.getInstance();
    const data = await configService.getTools();
    toolsCacheRef.current = data.tools;
    return data.tools;
  }, []);

  const buildRequestMessages = useCallback(
    (messages: Message[]) => {
      const systemPrompt = getEffectiveSystemPrompt(
        deps.currentChat?.config?.baseSystemPrompt || "",
      );
      const openaiMessages: any[] = [];
      if (systemPrompt) {
        openaiMessages.push({
          role: "system",
          content: systemPrompt,
        });
      }

      messages.forEach((message) => {
        const mapped = mapMessageToOpenAI(message);
        if (mapped) {
          openaiMessages.push(mapped);
        }
      });

      return openaiMessages;
    },
    [deps.currentChat?.config?.baseSystemPrompt],
  );

  const sendMessage = useCallback(
    async (content: string, images?: ImageFile[]) => {
      if (!deps.currentChat) {
        modal.info({
          title: "No Active Chat",
          content: "Please create or select a chat before sending a message.",
        });
        return;
      }

      const chatId = deps.currentChat.id;
      const messageImages =
        images?.map((img) => ({
          id: img.id,
          base64: img.base64,
          name: img.name,
          size: img.size,
          type: img.type,
        })) || [];

      const userMessage: UserMessage = {
        role: "user",
        content,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        images: messageImages,
      };

      const updatedMessages = [...deps.currentChat.messages, userMessage];
      await deps.addMessage(chatId, userMessage);

      deps.setProcessing(true);
      const controller = new AbortController();
      abortRef.current = controller;
      const streamingMessageId = `streaming-${chatId}`;

      try {
        const client = getOpenAIClient();
        const tools = await resolveTools();
        const model = selectedModel || "gpt-4o-mini";
        let openaiMessages = buildRequestMessages(updatedMessages);

        for (let step = 0; step < 3; step += 1) {
          streamingMessageIdRef.current = streamingMessageId;
          streamingContentRef.current = "";
          streamingMessageBus.publish({
            chatId,
            messageId: streamingMessageId,
            content: "",
          });

          const stream = client.chat.completions.stream(
            {
              model,
              messages: openaiMessages,
              tools: tools.length > 0 ? tools : undefined,
            },
            { signal: controller.signal },
          );

          const toolCallsMap = new Map<
            number,
            { id: string; name: string; arguments: string }
          >();
          let sawToolCalls = false;
          let sawContent = false;
          const activeMessageId = streamingMessageId;

          for await (const chunk of stream as any) {
            const choice = chunk?.choices?.[0];
            const delta = choice?.delta;
            if (!delta) {
              continue;
            }

            if (delta.tool_calls) {
              sawToolCalls = true;
              delta.tool_calls.forEach((call: any) => {
                const existing = toolCallsMap.get(call.index) ?? {
                  id: call.id ?? "",
                  name: "",
                  arguments: "",
                };
                if (call.id) {
                  existing.id = call.id;
                }
                if (call.function?.name) {
                  existing.name = call.function.name;
                }
                if (call.function?.arguments) {
                  existing.arguments += call.function.arguments;
                }
                toolCallsMap.set(call.index, existing);
              });
            }

            if (!sawToolCalls && delta.content) {
              const nextContent = `${streamingContentRef.current}${delta.content}`;
              streamingContentRef.current = nextContent;
              streamingMessageBus.publish({
                chatId,
                messageId: activeMessageId,
                content: nextContent,
              });
              sawContent = true;
            }
          }

          let finalMessage: any = null;
          try {
            finalMessage = await stream.finalMessage();
          } catch {}

          let streamedToolCalls = Array.from(toolCallsMap.values())
            .filter((call) => call.name)
            .map((call) => ({
              id: call.id || `call_${crypto.randomUUID()}`,
              type: "function",
              function: {
                name: call.name,
                arguments: call.arguments,
              },
            }));

          if (
            streamedToolCalls.length === 0 &&
            Array.isArray(finalMessage?.tool_calls) &&
            finalMessage.tool_calls.length > 0
          ) {
            streamedToolCalls = finalMessage.tool_calls.map((call: any) => ({
              id: call.id || `call_${crypto.randomUUID()}`,
              type: "function",
              function: {
                name: call.function?.name ?? "",
                arguments: call.function?.arguments ?? "",
              },
            }));
            sawToolCalls = true;
          }

          if (!sawContent && finalMessage?.content) {
            streamingContentRef.current = finalMessage.content;
            streamingMessageBus.publish({
              chatId,
              messageId: activeMessageId,
              content: finalMessage.content,
            });
            sawContent = true;
          }

          if (streamedToolCalls.length === 0) {
            if (streamingContentRef.current) {
              const assistantMessage: AssistantTextMessage = {
                id: crypto.randomUUID(),
                role: "assistant",
                type: "text",
                content: streamingContentRef.current,
                createdAt: new Date().toISOString(),
              };
              await deps.addMessage(chatId, assistantMessage);
            }
            streamingMessageBus.clear(chatId, activeMessageId);
            streamingMessageIdRef.current = null;
            streamingContentRef.current = "";
            break;
          }

          streamingMessageBus.clear(chatId, activeMessageId);
          streamingMessageIdRef.current = null;
          streamingContentRef.current = "";

          const toolCallMessage: AssistantToolCallMessage = {
            id: crypto.randomUUID(),
            role: "assistant",
            type: "tool_call",
            toolCalls: streamedToolCalls.map((call) => ({
              toolCallId: call.id,
              toolName: call.function.name,
              parameters: (() => {
                try {
                  return JSON.parse(call.function.arguments || "{}");
                } catch {
                  return {};
                }
              })(),
            })),
            createdAt: new Date().toISOString(),
          };

          await deps.addMessage(chatId, toolCallMessage);

          openaiMessages = [
            ...openaiMessages,
            {
              role: "assistant",
              content: "",
              tool_calls: streamedToolCalls,
            },
          ];

          const toolService = ToolService.getInstance();
          for (const call of streamedToolCalls) {
            let args: Record<string, any> = {};
            try {
              args = JSON.parse(call.function.arguments || "{}");
            } catch {}

            const parameters = Object.entries(args).map(([name, value]) => ({
              name,
              value: typeof value === "string" ? value : JSON.stringify(value),
            }));

            const result = await toolService.executeTool({
              tool_name: call.function.name,
              parameters,
            });

            const toolResultMessage: AssistantToolResultMessage = {
              id: crypto.randomUUID(),
              role: "assistant",
              type: "tool_result",
              toolName: call.function.name,
              toolCallId: call.id,
              result: {
                tool_name: call.function.name,
                result: result.result,
                display_preference: result.display_preference,
              },
              isError: false,
              createdAt: new Date().toISOString(),
            };

            await deps.addMessage(chatId, toolResultMessage);

            openaiMessages = [
              ...openaiMessages,
              {
                role: "tool",
                tool_call_id: call.id,
                content: result.result,
              },
            ];
          }
        }
      } catch (error) {
        if (streamingMessageIdRef.current) {
          streamingMessageBus.clear(chatId, streamingMessageIdRef.current);
        }
        streamingMessageIdRef.current = null;
        streamingContentRef.current = "";
        if ((error as any).name === "AbortError") {
          appMessage.info("Request cancelled");
        } else {
          console.error(
            "[useChatOpenAIStreaming] Failed to send message:",
            error,
          );
          appMessage.error("Failed to send message. Please try again.");
        }
      } finally {
        abortRef.current = null;
        if (streamingMessageIdRef.current) {
          streamingMessageBus.clear(chatId, streamingMessageIdRef.current);
        }
        streamingMessageIdRef.current = null;
        streamingContentRef.current = "";
        deps.setProcessing(false);
      }
    },
    [
      deps,
      modal,
      appMessage,
      resolveTools,
      buildRequestMessages,
      selectedModel,
    ],
  );

  return {
    sendMessage,
    cancel,
  };
}
