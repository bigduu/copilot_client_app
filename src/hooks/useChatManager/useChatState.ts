import { useMemo } from "react";
import { useAppStore } from "../../store";
import type { ChatItem, Message } from "../../types/chat";

/**
 * Hook for chat state selection and derived state
 * Handles Zustand store connections and computed values
 */
export interface UseChatState {
  // State from store
  chats: ChatItem[];
  currentChatId: string | null;
  currentChat: ChatItem | null;

  // Derived state
  baseMessages: Message[];
  pinnedChats: ChatItem[];
  unpinnedChats: ChatItem[];
  chatCount: number;

  // Store actions (re-exported for convenience)
  addMessage: (chatId: string, message: Message) => Promise<void>;
  deleteMessage: (chatId: string, messageId: string) => void;
  selectChat: (chatId: string | null) => void;
  deleteChat: (chatId: string) => Promise<void>;
  deleteChats: (chatIds: string[]) => Promise<void>;
  pinChat: (chatId: string) => void;
  unpinChat: (chatId: string) => void;
  updateChat: (chatId: string, updates: Partial<ChatItem>) => void;
  loadChats: () => Promise<void>;
  updateMessageContent: (
    chatId: string,
    messageId: string,
    content: string
  ) => Promise<void>;
}

export function useChatState(): UseChatState {
  // --- STATE SELECTION FROM ZUSTAND ---
  const chats = useAppStore((state) => state.chats);
  const currentChatId = useAppStore((state) => state.currentChatId);
  const addMessage = useAppStore((state) => state.addMessage);
  const selectChat = useAppStore((state) => state.selectChat);
  const deleteChat = useAppStore((state) => state.deleteChat);
  const deleteChats = useAppStore((state) => state.deleteChats);
  const deleteMessage = useAppStore((state) => state.deleteMessage);
  const updateChat = useAppStore((state) => state.updateChat);
  const pinChat = useAppStore((state) => state.pinChat);
  const unpinChat = useAppStore((state) => state.unpinChat);
  const loadChats = useAppStore((state) => state.loadChats);
  const updateMessageContent = useAppStore(
    (state) => state.updateMessageContent
  );

  // --- DERIVED STATE ---
  const currentChat = useMemo(
    () => chats.find((chat) => chat.id === currentChatId) || null,
    [chats, currentChatId]
  );

  const baseMessages = useMemo(
    () => currentChat?.messages || [],
    [currentChat]
  );

  const pinnedChats = useMemo(
    () => chats.filter((chat) => chat.pinned),
    [chats]
  );

  const unpinnedChats = useMemo(
    () => chats.filter((chat) => !chat.pinned),
    [chats]
  );

  const chatCount = chats.length;

  return {
    // State
    chats,
    currentChatId,
    currentChat,
    baseMessages,
    pinnedChats,
    unpinnedChats,
    chatCount,

    // Actions
    addMessage,
    deleteMessage,
    selectChat,
    deleteChat,
    deleteChats,
    pinChat,
    unpinChat,
    updateChat,
    loadChats,
    updateMessageContent,
  };
}
