import { StateCreator } from 'zustand';
import { ChatItem, Message } from '../../types/chat';
import { StorageService } from '../../services/StorageService';
import type { AppState } from '../';

export interface ChatSlice {
  // State
  chats: ChatItem[];
  currentChatId: string | null;
  latestActiveChatId: string | null; // Store the last active chat ID
  messages: Record<string, Message[]>;
  isProcessing: boolean;
  streamingMessage: { chatId: string; content: string } | null;

  // Actions
  addChat: (chat: Omit<ChatItem, 'id'>) => void;
  selectChat: (chatId: string | null) => void;
  deleteChat: (chatId: string) => Promise<void>;
  deleteChats: (chatIds: string[]) => Promise<void>;
  updateChat: (chatId: string, updates: Partial<ChatItem>) => void;
  pinChat: (chatId: string) => void;
  unpinChat: (chatId: string) => void;
  
  addMessage: (chatId: string, message: Message) => void;
  setMessages: (chatId: string, messages: Message[]) => void;
  updateMessage: (chatId: string, messageId: string, updates: Partial<Message>) => void;
  updateMessageContent: (chatId: string, messageId: string, content: string) => void; // New action for streaming
  deleteMessage: (chatId: string, messageId: string) => void;
  
  loadChats: () => Promise<void>;
  saveChats: () => Promise<void>;

  setProcessing: (isProcessing: boolean) => void;
  setStreamingMessage: (streamingMessage: { chatId: string; content: string } | null) => void;
}

export const createChatSlice = (storageService: StorageService): StateCreator<AppState, [], [], ChatSlice> => (set, get) => ({
  // Initial state
  chats: [],
  currentChatId: null,
  latestActiveChatId: null,
  messages: {},
  isProcessing: false,
  streamingMessage: null,

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
  },

  selectChat: (chatId) => {
    set({ ...get(), currentChatId: chatId, latestActiveChatId: chatId });
  },

  deleteChat: async (chatId) => {
    await storageService.deleteMessages(chatId);
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
  },

  deleteChats: async (chatIds) => {
    await storageService.deleteMultipleMessages(chatIds);
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
  },

  pinChat: (chatId) => {
    get().updateChat(chatId, { pinned: true });
  },

  unpinChat: (chatId) => {
    get().updateChat(chatId, { pinned: false });
  },

  // Message management
  setMessages: (chatId, messages) => {
    set(state => ({
      ...state,
      messages: {
        ...state.messages,
        [chatId]: messages
      }
    }));
  },

  addMessage: (chatId, message) => {
    set(state => ({
      ...state,
      messages: {
        ...state.messages,
        [chatId]: [...(state.messages[chatId] || []), message]
      }
    }));
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

  updateMessageContent: (chatId, messageId, content) => {
    set(state => {
      const currentMessages = state.messages[chatId] || [];
      const messageExists = currentMessages.some(msg => msg.id === messageId);

      if (!messageExists) {
        // Don't warn, as this can happen if the stream starts before the message is added
        return state;
      }

      return {
        ...state,
        messages: {
          ...state.messages,
          [chatId]: currentMessages.map(msg =>
            msg.id === messageId ? { ...msg, content } : msg
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
  },

  // Data persistence
  loadChats: async () => {
    try {
      const { chats, messages } = await storageService.loadAllData();
      const latestActiveChatId = await storageService.loadLatestActiveChatId();

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

      set({
        chats: migratedChats,
        messages,
        latestActiveChatId: latestActiveChatId,
        currentChatId: currentChatId,
        isProcessing: false,
        streamingMessage: null,
      });
    } catch (error) {
      console.error('Failed to load chats:', error);
      set({ chats: [], messages: {}, latestActiveChatId: null, currentChatId: null, isProcessing: false, streamingMessage: null });
    }
  },

  saveChats: async () => {
    try {
      const { chats, messages, latestActiveChatId } = get();
      await storageService.saveAllData(chats, messages);
      await storageService.saveLatestActiveChatId(latestActiveChatId);
    } catch (error) {
      console.error('Failed to save chats:', error);
    }
  },

  setProcessing: (isProcessing) => {
    set({ isProcessing });
  },

  setStreamingMessage: (streamingMessage) => {
    set({ streamingMessage });
  },
});
