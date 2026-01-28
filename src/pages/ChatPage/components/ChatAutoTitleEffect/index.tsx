import { useEffect, useRef } from "react";
import { useAppStore } from "../../store";
import { useChatTitleGeneration } from "../../hooks/useChatManager/useChatTitleGeneration";

export const ChatAutoTitleEffect: React.FC = () => {
  const chats = useAppStore((state) => state.chats);
  const currentChatId = useAppStore((state) => state.currentChatId);
  const updateChat = useAppStore((state) => state.updateChat);
  const { generateChatTitle } = useChatTitleGeneration({ chats, updateChat });
  const lastAutoTitleMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentChatId) return;
    const currentChat = chats.find((chat) => chat.id === currentChatId);
    if (!currentChat) return;
    const messages = currentChat.messages;
    if (messages.length === 0) return;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== "assistant") return;
    if (lastMessage.id === lastAutoTitleMessageIdRef.current) return;
    lastAutoTitleMessageIdRef.current = lastMessage.id;
    generateChatTitle(currentChatId).catch((error) => {
      console.warn("Auto title generation failed:", error);
    });
  }, [chats, currentChatId, generateChatTitle]);

  return null;
};
