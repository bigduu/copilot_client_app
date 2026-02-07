import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { selectCurrentChat, useAppStore } from "../../store";
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
  isProcessing: boolean;

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
  setProcessing: (isProcessing: boolean) => void;
}

export function useChatState(): UseChatState {
  const {
    chats,
    currentChatId,
    currentChat,
    addMessage,
    selectChat,
    deleteChat,
    deleteChats,
    deleteMessage,
    updateChat,
    pinChat,
    unpinChat,
    loadChats,
    isProcessing,
    setProcessing,
  } = useAppStore(
    useShallow((state) => ({
      chats: state.chats,
      currentChatId: state.currentChatId,
      currentChat: selectCurrentChat(state),
      addMessage: state.addMessage,
      selectChat: state.selectChat,
      deleteChat: state.deleteChat,
      deleteChats: state.deleteChats,
      deleteMessage: state.deleteMessage,
      updateChat: state.updateChat,
      pinChat: state.pinChat,
      unpinChat: state.unpinChat,
      loadChats: state.loadChats,
      isProcessing: state.isProcessing,
      setProcessing: state.setProcessing,
    })),
  );

  // --- DERIVED STATE ---
  const baseMessages = useMemo(() => currentChat?.messages || [], [currentChat]);

  const pinnedChats = useMemo(
    () => chats.filter((chat) => chat.pinned),
    [chats],
  );

  const unpinnedChats = useMemo(
    () => chats.filter((chat) => !chat.pinned),
    [chats],
  );

  const chatCount = chats.length;

  return {
    // State
    chats,
    currentChatId,
    currentChat,
    isProcessing,
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
    setProcessing,
  };
}
