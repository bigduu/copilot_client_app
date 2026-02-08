import { useCallback, useMemo } from "react";
import type { Message, UserFileReferenceMessage } from "../../types/chat";
import type { UseChatState } from "./types";

export interface UseChatHistory {
  currentMessages: Message[];
  retryLastMessage: () => Promise<void>;
}

interface UseChatHistoryDeps {
  onRetry?: (content: string) => Promise<void>;
}

export function useChatHistory(
  state: UseChatState,
  deps?: UseChatHistoryDeps,
): UseChatHistory {
  const currentMessages = useMemo(
    () => state.baseMessages,
    [state.baseMessages],
  );

  const retryLastMessage = useCallback(async () => {
    if (!state.currentChatId || !state.currentChat) return;
    const history = [...state.baseMessages];
    if (history.length === 0) return;

    const lastMessage = history[history.length - 1];
    let trimmedHistory = history;
    if (lastMessage?.role === "assistant") {
      state.deleteMessage(state.currentChatId, lastMessage.id);
      trimmedHistory = history.slice(0, -1);
    }

    const lastUser = [...trimmedHistory]
      .reverse()
      .find((msg) => msg.role === "user");
    if (!lastUser) return;

    const content =
      "content" in lastUser
        ? lastUser.content
        : (lastUser as UserFileReferenceMessage).displayText;

    if (typeof content !== "string") return;
    await deps?.onRetry?.(content);
  }, [
    deps,
    state.baseMessages,
    state.currentChat,
    state.currentChatId,
    state.deleteMessage,
  ]);

  return {
    currentMessages,
    retryLastMessage,
  };
}
