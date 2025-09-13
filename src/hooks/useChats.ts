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
  selectChat: (chatId: string | null) => void;
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

export const useChats = (): UseChatsReturn => {
  // Get data from Zustand Store (Hook → Store)
  const chats = useAppStore(state => state.chats);
  const currentChatId = useAppStore(state => state.currentChatId);
  const messages = useAppStore(state => state.messages);

  // Get action methods from Zustand Store (Hook → Store)
  const addChat = useAppStore(state => state.addChat);
  const selectChat = useAppStore(state => state.selectChat);
  const deleteChat = useAppStore(state => state.deleteChat);
  const deleteChats = useAppStore(state => state.deleteChats);
  const updateChat = useAppStore(state => state.updateChat);
  const pinChat = useAppStore(state => state.pinChat);
  const unpinChat = useAppStore(state => state.unpinChat);
  const loadChats = useAppStore(state => state.loadChats);
  const saveChats = useAppStore(state => state.saveChats);

  // Calculate derived state (computed from Store data)
  const currentChat = chats.find(chat => chat.id === currentChatId) || null;
  const currentMessages = currentChatId ? messages[currentChatId] || [] : [];
  const pinnedChats = chats.filter(chat => chat.pinned);
  const unpinnedChats = chats.filter(chat => !chat.pinned);
  const chatCount = chats.length;

  // Convenience action methods (combining Store operations)
  const createNewChat = (title?: string, options?: Partial<ChatItem>) => {
    addChat({
      title: title || 'New Chat',
      messages: [],
      createdAt: Date.now(),
      systemPromptId: 'general_assistant', // TODO: Dynamically get default category from backend
      toolCategory: 'general_assistant', // TODO: Dynamically get default category from backend
      ...options,
    });
  };

  const createChatWithSystemPrompt = (preset: SystemPromptPreset) => {
    addChat({
      title: `New Chat - ${preset.name}`,
      messages: [],
      createdAt: Date.now(),
      systemPromptId: preset.id,
      toolCategory: preset.category,
      systemPrompt: preset.content,
    });
  };

  const toggleChatPin = (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
      if (chat.pinned) {
        unpinChat(chatId);
      } else {
        pinChat(chatId);
      }
    }
  };

  const updateChatTitle = (chatId: string, newTitle: string) => {
    updateChat(chatId, { title: newTitle });
  };

  const deleteEmptyChats = () => {
    const emptyChats = chats.filter(chat => !chat.pinned && chat.messages.length === 0);
    const emptyChatsIds = emptyChats.map(chat => chat.id);
    if (emptyChatsIds.length > 0) {
      deleteChats(emptyChatsIds);
    }
  };

  const deleteAllUnpinnedChats = () => {
    const unpinnedChatsIds = unpinnedChats.map(chat => chat.id);
    if (unpinnedChatsIds.length > 0) {
      deleteChats(unpinnedChatsIds);
    }
  };

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
    selectChat,
    deleteChat,
    deleteChats,
    pinChat,
    unpinChat,
    updateChat,
    loadChats,
    saveChats,

    // Convenience Operations (Combining multiple Store operations)
    createNewChat,
    createChatWithSystemPrompt,
    toggleChatPin,
    updateChatTitle,
    deleteEmptyChats,
    deleteAllUnpinnedChats,
  };
};
