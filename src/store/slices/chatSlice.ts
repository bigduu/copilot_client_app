import { StateCreator } from 'zustand';
import { ChatItem, Message } from '../../types/chat';
import { OptimizedStorageService, OptimizedChatItem } from '../../services/OptimizedStorageService';
import type { AppState } from '../';

export interface ChatSlice {
  // State
  chats: ChatItem[];
  currentChatId: string | null;
  latestActiveChatId: string | null; // Store the last active chat ID
  messages: Record<string, Message[]>;

  // Actions
  addChat: (chat: Omit<ChatItem, 'id'>) => void;
  selectChat: (chatId: string | null) => void;
  deleteChat: (chatId: string) => void;
  deleteChats: (chatIds: string[]) => void;
  updateChat: (chatId: string, updates: Partial<ChatItem>) => void;
  pinChat: (chatId: string) => void;
  unpinChat: (chatId: string) => void;
  
  addMessage: (chatId: string, message: Message) => void;
  updateMessage: (chatId: string, messageId: string, updates: Partial<Message>) => void;
  deleteMessage: (chatId: string, messageId: string) => void;
  
  loadChats: () => Promise<void>;
  saveChats: () => Promise<void>;
  saveChatsDebounced?: () => void;
}

const storageService = OptimizedStorageService.getInstance();

export const createChatSlice: StateCreator<AppState, [], [], ChatSlice> = (set, get) => ({
  // Initial state
  chats: [],
  currentChatId: null,
  latestActiveChatId: null,
  messages: {},

  // Chat management actions
  addChat: (chatData) => {
    const newChat: ChatItem = {
      ...chatData,
      id: Date.now().toString(),
      createdAt: chatData.createdAt || Date.now(),
      pinned: false,
      toolCategory: chatData.toolCategory || "general_assistant",
      systemPromptId: chatData.systemPromptId || "general_assistant",
    };

    set(state => ({
      ...state,
      chats: [...state.chats, newChat],
      currentChatId: newChat.id,
      latestActiveChatId: newChat.id,
      messages: { ...state.messages, [newChat.id]: chatData.messages || [] }
    }));

    get().saveChats();
  },

  selectChat: (chatId) => {
    set({ ...get(), currentChatId: chatId, latestActiveChatId: chatId });
  },

  deleteChat: (chatId) => {
    set(state => {
      const newChats = state.chats.filter(chat => chat.id !== chatId);
      const newMessages = { ...state.messages };
      delete newMessages[chatId];

      let newCurrentChatId = state.currentChatId;
      let newLatestActiveChatId = state.latestActiveChatId;

      if (state.currentChatId === chatId) {
        newCurrentChatId = null;
      }

      if (state.latestActiveChatId === chatId) {
        newLatestActiveChatId = newChats.length > 0 ? newChats[0].id : null;
      }

      return {
        ...state,
        chats: newChats,
        messages: newMessages,
        currentChatId: newCurrentChatId,
        latestActiveChatId: newLatestActiveChatId
      };
    });

    get().saveChats();
  },

  deleteChats: (chatIds) => {
    set(state => {
      const newChats = state.chats.filter(chat => !chatIds.includes(chat.id));
      const newMessages = { ...state.messages };
      chatIds.forEach(id => delete newMessages[id]);

      let newCurrentChatId = state.currentChatId;
      let newLatestActiveChatId = state.latestActiveChatId;

      if (chatIds.includes(state.currentChatId || '')) {
        newCurrentChatId = null;
      }

      if (chatIds.includes(state.latestActiveChatId || '')) {
        newLatestActiveChatId = newChats.length > 0 ? newChats[0].id : null;
      }

      return {
        ...state,
        chats: newChats,
        messages: newMessages,
        currentChatId: newCurrentChatId,
        latestActiveChatId: newLatestActiveChatId
      };
    });

    get().saveChats();
  },

  updateChat: (chatId, updates) => {
    set(state => ({
      ...state,
      chats: state.chats.map(chat =>
        chat.id === chatId
          ? { ...chat, ...updates }
          : chat
      )
    }));

    get().saveChats();
  },

  pinChat: (chatId) => {
    get().updateChat(chatId, { pinned: true });
  },

  unpinChat: (chatId) => {
    get().updateChat(chatId, { pinned: false });
  },

  // Message management
  addMessage: (chatId, message) => {
    set(state => ({
      ...state,
      messages: {
        ...state.messages,
        [chatId]: [...(state.messages[chatId] || []), message]
      }
    }));

    const store = get();
    if (store.saveChatsDebounced) {
      store.saveChatsDebounced();
    }
  },

  updateMessage: (chatId, messageId, updates) => {
    set(state => {
      const currentMessages = state.messages[chatId] || [];
      const messageExists = currentMessages.some(msg => msg.id === messageId);

      if (!messageExists) {
        console.warn(`Message ${messageId} not found in chat ${chatId}`);
        return state;
      }

      return {
        ...state,
        messages: {
          ...state.messages,
          [chatId]: currentMessages.map(msg =>
            msg.id === messageId ? { ...msg, ...updates } : msg
          )
        }
      };
    });
  },

  deleteMessage: (chatId, messageId) => {
    set(state => {
      const currentMessages = state.messages[chatId] || [];
      const messageExists = currentMessages.some(msg => msg.id === messageId);

      if (!messageExists) {
        console.warn(`Message ${messageId} not found in chat ${chatId}`);
        return state;
      }

      return {
        ...state,
        messages: {
          ...state.messages,
          [chatId]: currentMessages.filter(msg => msg.id !== messageId)
        }
      };
    });

    get().saveChats();
  },

  // Data persistence
  loadChats: async () => {
    try {
      const optimizedChats = await storageService.loadChats();
      const latestActiveChatId = await storageService.loadLatestActiveChatId();

      const chats: ChatItem[] = optimizedChats.map(chat => ({
        ...chat,
        messages: [],
      }));

      const messages: Record<string, Message[]> = {};
      for (const chat of optimizedChats) {
        messages[chat.id] = await storageService.loadMessages(chat.id);
      }

      const migratedChats = chats.map(chat => {
        if (!chat.systemPromptId) {
          return {
            ...chat,
            systemPromptId: 'general_assistant',
            toolCategory: chat.toolCategory || 'general_assistant',
          };
        }
        return chat;
      });

      let currentChatId = null;
      if (latestActiveChatId && migratedChats.some(chat => chat.id === latestActiveChatId)) {
        currentChatId = latestActiveChatId;
      } else if (migratedChats.length > 0) {
        currentChatId = migratedChats[0].id;
      }

      set(state => ({
        ...state,
        chats: migratedChats,
        messages,
        latestActiveChatId: latestActiveChatId,
        currentChatId: currentChatId
      }));
    } catch (error) {
      console.error('Failed to load chats:', error);
      set(state => ({ ...state, chats: [], messages: {}, latestActiveChatId: null, currentChatId: null }));
    }
  },

  saveChats: async () => {
    try {
      const { chats, messages, latestActiveChatId } = get();

      const optimizedChats: OptimizedChatItem[] = chats.map(chat => ({
        id: chat.id,
        title: chat.title,
        createdAt: chat.createdAt,
        systemPrompt: chat.systemPrompt,
        systemPromptId: chat.systemPromptId,
        toolCategory: chat.toolCategory || 'general_assistant',
        pinned: chat.pinned || false,
        model: chat.model,
        messageCount: messages[chat.id]?.length || 0,
        lastMessageAt: messages[chat.id]?.length > 0 ? Date.now() : undefined,
      }));

      await storageService.saveChats(optimizedChats);

      for (const chat of chats) {
        const chatMessages = messages[chat.id] || [];
        if (chatMessages.length > 0) {
          await storageService.saveMessages(chat.id, chatMessages);
        }
      }

      await storageService.saveLatestActiveChatId(latestActiveChatId);
    } catch (error) {
      console.error('Failed to save chats:', error);
    }
  },
});