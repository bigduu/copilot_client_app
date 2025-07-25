import { useChatStore } from '../store/chatStore';
import { ChatItem, Message, SystemPromptPreset } from '../types/chat';

/**
 * Hook for managing chat list operations
 * 遵循 Hook → Store → Service 架构模式
 *
 * 数据流向：
 * Component → useChats Hook → Zustand Store → Services → External APIs
 */
interface UseChatsReturn {
  // 数据状态
  chats: ChatItem[];
  currentChatId: string | null;
  currentChat: ChatItem | null;
  currentMessages: Message[];
  pinnedChats: ChatItem[];
  unpinnedChats: ChatItem[];
  chatCount: number;

  // 基础操作 (直接映射到 Store)
  selectChat: (chatId: string | null) => void;
  deleteChat: (chatId: string) => void;
  deleteChats: (chatIds: string[]) => void;
  pinChat: (chatId: string) => void;
  unpinChat: (chatId: string) => void;
  updateChat: (chatId: string, updates: Partial<ChatItem>) => void;
  loadChats: () => Promise<void>;
  saveChats: () => Promise<void>;

  // 便捷操作 (组合多个 Store 操作)
  createNewChat: (title?: string, options?: Partial<ChatItem>) => void;
  createChatWithSystemPrompt: (preset: SystemPromptPreset) => void;
  toggleChatPin: (chatId: string) => void;
  updateChatTitle: (chatId: string, newTitle: string) => void;
  deleteEmptyChats: () => void;
  deleteAllUnpinnedChats: () => void;
}

export const useChats = (): UseChatsReturn => {
  // 从 Zustand Store 获取数据 (Hook → Store)
  const chats = useChatStore(state => state.chats);
  const currentChatId = useChatStore(state => state.currentChatId);
  const messages = useChatStore(state => state.messages);

  // 从 Zustand Store 获取操作方法 (Hook → Store)
  const addChat = useChatStore(state => state.addChat);
  const selectChat = useChatStore(state => state.selectChat);
  const deleteChat = useChatStore(state => state.deleteChat);
  const deleteChats = useChatStore(state => state.deleteChats);
  const updateChat = useChatStore(state => state.updateChat);
  const pinChat = useChatStore(state => state.pinChat);
  const unpinChat = useChatStore(state => state.unpinChat);
  const loadChats = useChatStore(state => state.loadChats);
  const saveChats = useChatStore(state => state.saveChats);

  // 计算派生状态 (从 Store 数据计算得出)
  const currentChat = chats.find(chat => chat.id === currentChatId) || null;
  const currentMessages = currentChatId ? messages[currentChatId] || [] : [];
  const pinnedChats = chats.filter(chat => chat.pinned);
  const unpinnedChats = chats.filter(chat => !chat.pinned);
  const chatCount = chats.length;

  // 便捷操作方法 (组合 Store 操作)
  const createNewChat = (title?: string, options?: Partial<ChatItem>) => {
    addChat({
      title: title || 'New Chat',
      messages: [],
      createdAt: Date.now(),
      systemPromptId: 'general_assistant', // TODO: 从后端动态获取默认category
      toolCategory: 'general_assistant', // TODO: 从后端动态获取默认category
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
    // 数据状态
    chats,
    currentChatId,
    currentChat,
    currentMessages,
    pinnedChats,
    unpinnedChats,
    chatCount,

    // 基础操作 (直接映射到 Store)
    selectChat,
    deleteChat,
    deleteChats,
    pinChat,
    unpinChat,
    updateChat,
    loadChats,
    saveChats,

    // 便捷操作 (组合多个 Store 操作)
    createNewChat,
    createChatWithSystemPrompt,
    toggleChatPin,
    updateChatTitle,
    deleteEmptyChats,
    deleteAllUnpinnedChats,
  };
};
