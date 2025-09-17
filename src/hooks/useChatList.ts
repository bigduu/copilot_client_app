import { useCallback } from 'react';
import { useAppStore } from '../store';
import { ChatItem, Message, SystemPromptPreset } from '../types/chat';

/**
 * Hook for managing chat list operations
 * Follows Hook → Store → Service architecture pattern
 *
 * Data Flow:
 * Component → useChats Hook → Zustand Store → Services → External APIs
 */
interface UseChatsReturn {
  // Data State
  chats: ChatItem[];
  currentChatId: string | null;
  currentChat: ChatItem | null;
  currentMessages: Message[];
  pinnedChats: ChatItem[];
  unpinnedChats: ChatItem[];
  chatCount: number;

  // Basic Operations (Directly mapped to Store)
  addMessage: (chatId: string, message: Message) => void;
  setMessages: (chatId: string, messages: Message[]) => void;
  selectChat: (chatId:string | null) => void;
  deleteMessage: (chatId: string, messageId: string) => void;
  deleteChat: (chatId: string) => void;
  deleteChats: (chatIds: string[]) => void;
  pinChat: (chatId: string) => void;
  unpinChat: (chatId: string) => void;
  updateChat: (chatId: string, updates: Partial<ChatItem>) => void;
  loadChats: () => Promise<void>;
  saveChats: () => Promise<void>;

  // Convenience Operations (Combining multiple Store operations)
  createNewChat: (title?: string, options?: Partial<ChatItem>) => void;
  createChatWithSystemPrompt: (preset: SystemPromptPreset) => void;
  toggleChatPin: (chatId: string) => void;
  updateChatTitle: (chatId: string, newTitle: string) => void;
  deleteEmptyChats: () => void;
  deleteAllUnpinnedChats: () => void;
}

export const useChatList = (): UseChatsReturn => {
  // Get data from Zustand Store (Hook → Store)
  const chats = useAppStore(state => state.chats);
  const currentChatId = useAppStore(state => state.currentChatId);
  // The 'messages' record is deprecated. Messages are now part of each chat item.

  // Get action methods from Zustand Store (Hook → Store)
  const addChat = useAppStore(state => state.addChat);
  const setMessages = useAppStore(state => state.setMessages);
  const addMessage = useAppStore(state => state.addMessage);
  const selectChat = useAppStore(state => state.selectChat);
  const deleteChat = useAppStore(state => state.deleteChat);
  const deleteChats = useAppStore(state => state.deleteChats);
  const deleteMessage = useAppStore(state => state.deleteMessage);
  const updateChat = useAppStore(state => state.updateChat);
  const pinChat = useAppStore(state => state.pinChat);
  const unpinChat = useAppStore(state => state.unpinChat);
  const loadChats = useAppStore(state => state.loadChats);
  const saveChats = useAppStore(state => state.saveChats);

  // Memoize action methods to stabilize their references
  const memoizedAddMessage = useCallback(addMessage, [addMessage]);
  const memoizedSetMessages = useCallback(setMessages, [setMessages]);
  const memoizedSelectChat = useCallback(selectChat, [selectChat]);
  const memoizedDeleteMessage = useCallback(deleteMessage, [deleteMessage]);
  const memoizedDeleteChat = useCallback(deleteChat, [deleteChat]);
  const memoizedDeleteChats = useCallback(deleteChats, [deleteChats]);
  const memoizedPinChat = useCallback(pinChat, [pinChat]);
  const memoizedUnpinChat = useCallback(unpinChat, [unpinChat]);
  const memoizedUpdateChat = useCallback(updateChat, [updateChat]);
  const memoizedLoadChats = useCallback(loadChats, [loadChats]);
  const memoizedSaveChats = useCallback(saveChats, [saveChats]);

  // Calculate derived state (computed from Store data)
  const currentChat = chats.find(chat => chat.id === currentChatId) || null;
  // Correctly derive messages from the current chat item
  const currentMessages = currentChat ? currentChat.messages : [];
  const pinnedChats = chats.filter(chat => chat.pinned);
  const unpinnedChats = chats.filter(chat => !chat.pinned);
  const chatCount = chats.length;

  // Convenience action methods (combining Store operations)
  const createNewChat = useCallback((title?: string, options?: Partial<Omit<ChatItem, 'id'>>) => {
    const newChatData: Omit<ChatItem, 'id'> = {
      title: title || 'New Chat',
      createdAt: Date.now(),
      messages: [],
      config: {
        systemPromptId: 'general_assistant',
        toolCategory: 'general_assistant',
        lastUsedEnhancedPrompt: null,
      },
      currentInteraction: null,
      ...options,
    };
    addChat(newChatData);
    // Immediately save after adding a new chat
    saveChats();
  }, [addChat, saveChats]);

  const createChatWithSystemPrompt = useCallback((preset: SystemPromptPreset) => {
    const newChatData: Omit<ChatItem, 'id'> = {
      title: `New Chat - ${preset.name}`,
      createdAt: Date.now(),
      messages: [
        // Optionally pre-fill the system message
        {
          id: 'system-prompt',
          role: 'system',
          content: preset.content,
          createdAt: new Date().toISOString(),
        }
      ],
      config: {
        systemPromptId: preset.id,
        toolCategory: preset.category,
        lastUsedEnhancedPrompt: preset.content,
      },
      currentInteraction: null,
    };
    addChat(newChatData);
    // Immediately save after adding a new chat
    saveChats();
  }, [addChat, saveChats]);

  const toggleChatPin = useCallback((chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
      if (chat.pinned) {
        unpinChat(chatId);
      } else {
        pinChat(chatId);
      }
    }
  }, [chats, pinChat, unpinChat]);

  const updateChatTitle = useCallback((chatId: string, newTitle: string) => {
    updateChat(chatId, { title: newTitle });
  }, [updateChat]);

  const deleteEmptyChats = useCallback(() => {
    const emptyChats = chats.filter(chat => {
      // Logic updated to check messages directly from the chat item
      return !chat.pinned && chat.messages.length === 0;
    });
    const emptyChatIds = emptyChats.map(chat => chat.id);
    if (emptyChatIds.length > 0) {
      deleteChats(emptyChatIds);
    }
  }, [chats, deleteChats]);

  const deleteAllUnpinnedChats = useCallback(() => {
    const unpinnedChatsIds = unpinnedChats.map(chat => chat.id);
    if (unpinnedChatsIds.length > 0) {
      deleteChats(unpinnedChatsIds);
    }
  }, [unpinnedChats, deleteChats]);

  return {
    // Data State
    chats,
    currentChatId,
    currentChat,
    currentMessages,
    pinnedChats,
    unpinnedChats,
    chatCount,

    // Basic Operations (Directly mapped to Store)
    addMessage: memoizedAddMessage,
    setMessages: memoizedSetMessages,
    selectChat: memoizedSelectChat,
    deleteMessage: memoizedDeleteMessage,
    deleteChat: memoizedDeleteChat,
    deleteChats: memoizedDeleteChats,
    pinChat: memoizedPinChat,
    unpinChat: memoizedUnpinChat,
    updateChat: memoizedUpdateChat,
    loadChats: memoizedLoadChats,
    saveChats: memoizedSaveChats,

    // Convenience Operations (Combining multiple Store operations)
    createNewChat,
    createChatWithSystemPrompt,
    toggleChatPin,
    updateChatTitle,
    deleteEmptyChats,
    deleteAllUnpinnedChats,
  };
};
