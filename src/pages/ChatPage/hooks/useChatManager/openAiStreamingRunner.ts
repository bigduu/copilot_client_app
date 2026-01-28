import { ToolService } from "../../services/ToolService";
import type {
  AssistantTextMessage,
  AssistantToolCallMessage,
  AssistantToolResultMessage,
} from "../../types/chat";
import { streamingMessageBus } from "../../utils/streamingMessageBus";

interface StreamOpenAIWithToolsParams {
  chatId: string;
  client: any;
  tools: any[];
  model: string;
  openaiMessages: any[];
  controller: AbortController;
  streamingMessageIdRef: React.MutableRefObject<string | null>;
  streamingContentRef: React.MutableRefObject<string>;
  addMessage: (chatId: string, message: any) => Promise<void>;
}

export const streamOpenAIWithTools = async ({
  chatId,
  client,
  tools,
  model,
  openaiMessages,
  controller,
  streamingMessageIdRef,
  streamingContentRef,
  addMessage,
}: StreamOpenAIWithToolsParams) => {
  let currentMessages = openaiMessages;

  for (let step = 0; step < 3; step += 1) {
    const streamingMessageId = `streaming-${chatId}`;
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
        messages: currentMessages,
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
          messageId: streamingMessageId,
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
        messageId: streamingMessageId,
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
        await addMessage(chatId, assistantMessage);
      }
      streamingMessageBus.clear(chatId, streamingMessageId);
      streamingMessageIdRef.current = null;
      streamingContentRef.current = "";
      break;
    }

    streamingMessageBus.clear(chatId, streamingMessageId);
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

    await addMessage(chatId, toolCallMessage);

    currentMessages = [
      ...currentMessages,
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

      await addMessage(chatId, toolResultMessage);

      currentMessages = [
        ...currentMessages,
        {
          role: "tool",
          tool_call_id: call.id,
          content: result.result,
        },
      ];
    }
  }
};
