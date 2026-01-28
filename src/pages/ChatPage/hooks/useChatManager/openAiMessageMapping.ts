import type {
  Message,
  UserFileReferenceMessage,
  UserMessage,
} from "../../types/chat";
import { getEffectiveSystemPrompt } from "../../../../shared/utils/systemPromptEnhancement";

export const buildUserContent = (message: UserMessage) => {
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

export const mapMessageToOpenAI = (message: Message) => {
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

export const buildRequestMessages = (
  messages: Message[],
  baseSystemPrompt: string,
) => {
  const systemPrompt = getEffectiveSystemPrompt(baseSystemPrompt || "");
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
};
