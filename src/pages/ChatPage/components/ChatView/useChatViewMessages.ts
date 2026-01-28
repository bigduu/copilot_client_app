import { useCallback, useMemo } from "react";
import type { Message } from "../../types/chat";
import type { ChatItem } from "../../types/chat";

type RenderableEntry = {
  message: Message;
  messageType?: "text" | "plan" | "question" | "tool_call" | "tool_result";
};

export const useChatViewMessages = (
  currentChat: ChatItem | null,
  currentMessages: Message[],
) => {
  const systemPromptMessage = useMemo(() => {
    const existingSystemMessage = currentMessages.find(
      (msg: Message) => msg.role === "system",
    );
    if (existingSystemMessage) {
      return existingSystemMessage as Message;
    }

    if (currentChat?.config?.baseSystemPrompt) {
      return {
        id: `system-prompt-${currentChat.id}`,
        role: "system" as const,
        content: currentChat.config.baseSystemPrompt,
        createdAt: new Date(currentChat.createdAt).toISOString(),
      };
    }

    return null;
  }, [currentChat, currentMessages]);

  const shouldHideMessage = useCallback((item: Message): boolean => {
    if ("type" in item && item.type === "tool_result") {
      const toolResultMsg = item as any;
      if (toolResultMsg.result?.display_preference === "Hidden") {
        return true;
      }
    }

    return false;
  }, []);

  const convertRenderableEntry = useCallback(
    (
      entry: RenderableEntry,
    ): {
      message: Message;
      align: "flex-start" | "flex-end";
      messageType?: "text" | "plan" | "question" | "tool_call" | "tool_result";
    } => {
      const align = entry.message.role === "user" ? "flex-end" : "flex-start";

      let resolvedType = entry.messageType;
      if (
        !resolvedType &&
        entry.message.role === "assistant" &&
        "type" in entry.message
      ) {
        const assistantType = (entry.message as any).type as string | undefined;
        if (
          assistantType === "text" ||
          assistantType === "plan" ||
          assistantType === "question" ||
          assistantType === "tool_call" ||
          assistantType === "tool_result"
        ) {
          resolvedType = assistantType;
        }
      }

      return {
        message: entry.message,
        align,
        messageType: resolvedType,
      };
    },
    [],
  );

  const renderableMessages = useMemo<RenderableEntry[]>(() => {
    const filtered = currentMessages.filter((item) => {
      const role = item.role;

      if (
        role !== "user" &&
        role !== "assistant" &&
        role !== "system" &&
        role !== "tool"
      ) {
        return false;
      }

      if (shouldHideMessage(item)) {
        return false;
      }

      return true;
    });

    const entries: RenderableEntry[] = filtered.map((item) => {
      const message = item as Message;
      let inferredType: RenderableEntry["messageType"];
      if (message.role === "assistant" && "type" in message) {
        const assistantType = (message as any).type as string | undefined;
        if (
          assistantType === "text" ||
          assistantType === "plan" ||
          assistantType === "question" ||
          assistantType === "tool_call" ||
          assistantType === "tool_result"
        ) {
          inferredType = assistantType;
        }
      }

      return {
        message,
        messageType: inferredType,
      };
    });

    const hasSystemMessage = filtered.some((item) => item.role === "system");
    if (!hasSystemMessage && systemPromptMessage) {
      entries.unshift({ message: systemPromptMessage });
    }

    return entries;
  }, [currentMessages, shouldHideMessage, systemPromptMessage]);

  return {
    systemPromptMessage,
    renderableMessages,
    convertRenderableEntry,
  };
};
