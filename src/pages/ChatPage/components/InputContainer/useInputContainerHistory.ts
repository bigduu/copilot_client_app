import { useCallback } from "react";
import type { Message, UserFileReferenceMessage } from "../../types/chat";

interface UseInputContainerHistoryProps {
  currentChatId: string | null;
  currentChat: any | null;
  currentMessages: Message[];
  deleteMessage: (chatId: string, messageId: string) => void;
  sendMessage: (content: string) => Promise<void>;
  navigate: (
    direction: "previous" | "next",
    currentValue: string,
  ) => {
    applied: boolean;
    value: string | null;
  };
}

export const useInputContainerHistory = ({
  currentChatId,
  currentChat,
  currentMessages,
  deleteMessage,
  sendMessage,
  navigate,
}: UseInputContainerHistoryProps) => {
  const retryLastMessage = useCallback(async () => {
    if (!currentChatId || !currentChat) return;
    const history = [...currentMessages];
    if (history.length === 0) return;

    const lastMessage = history[history.length - 1];
    let trimmedHistory = history;
    if (lastMessage?.role === "assistant") {
      deleteMessage(currentChatId, lastMessage.id);
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

    await sendMessage(content);
  }, [currentChat, currentChatId, currentMessages, deleteMessage, sendMessage]);

  const handleHistoryNavigate = useCallback(
    (direction: "previous" | "next", currentValue: string): string | null => {
      const result = navigate(direction, currentValue);
      if (!result.applied) {
        return null;
      }
      return result.value;
    },
    [navigate],
  );

  return { retryLastMessage, handleHistoryNavigate };
};
