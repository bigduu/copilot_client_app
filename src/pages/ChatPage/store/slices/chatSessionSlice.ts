import { StateCreator } from "zustand";
import { ChatItem, Message } from "../../types/chat";
import { AgentClient } from "../../services/AgentService";
import type { AppState } from "../";

const CHAT_STORAGE_KEY = "copilot_chats_v3";
const ACTIVE_CHAT_ID_KEY = "copilot_active_chat_id";
const AUTO_TITLE_KEY = "copilot_auto_generate_titles";
const agentClient = AgentClient.getInstance();

export interface ChatSlice {
  // State
  chats: ChatItem[];
  currentChatId: string | null;
  latestActiveChatId: string | null; // Store the last active chat ID
  isProcessing: boolean;
  autoGenerateTitles: boolean;
  isUpdatingAutoTitlePreference: boolean;

  // Actions
  addChat: (chat: Omit<ChatItem, "id">) => Promise<string>; // Returns new chat ID
  selectChat: (chatId: string | null) => void;
  deleteChat: (chatId: string) => Promise<void>;
  deleteChats: (chatIds: string[]) => Promise<void>;
  updateChat: (chatId: string, updates: Partial<ChatItem>) => void;
  pinChat: (chatId: string) => void;
  unpinChat: (chatId: string) => void;

  addMessage: (chatId: string, message: Message) => Promise<void>;
  setMessages: (chatId: string, messages: Message[]) => void;
  updateMessage: (
    chatId: string,
    messageId: string,
    updates: Partial<Message>,
  ) => void;
  deleteMessage: (chatId: string, messageId: string) => void;

  loadChats: () => Promise<void>;

  setProcessing: (isProcessing: boolean) => void;
  setAutoGenerateTitlesPreference: (enabled: boolean) => Promise<void>;
}

export const createChatSlice: StateCreator<AppState, [], [], ChatSlice> = (
  set,
  get,
) => ({
  // Initial state
  chats: [],
  currentChatId: null,
  latestActiveChatId: null,
  isProcessing: false,
  autoGenerateTitles: true,
  isUpdatingAutoTitlePreference: false,

  // Chat management actions
  addChat: async (chatData) => {
    const newChat: ChatItem = {
      id: crypto.randomUUID(),
      ...chatData,
    };

    set((state) => {
      const chats = [...state.chats, newChat];
      persistChats(chats);
      localStorage.setItem(ACTIVE_CHAT_ID_KEY, newChat.id);
      return {
        ...state,
        chats,
        currentChatId: newChat.id,
        latestActiveChatId: newChat.id,
      };
    });

    return newChat.id;
  },

  selectChat: (chatId) => {
    set({ currentChatId: chatId, latestActiveChatId: chatId });
    if (chatId) {
      localStorage.setItem(ACTIVE_CHAT_ID_KEY, chatId);
    } else {
      localStorage.removeItem(ACTIVE_CHAT_ID_KEY);
    }
  },

  deleteChat: async (chatId) => {
    const chatToDelete = get().chats.find((chat) => chat.id === chatId);
    const sessionId = getAgentSessionId(chatToDelete);
    await deleteBackendSession(sessionId);

    // Update local state
    set((state) => {
      const newChats = state.chats.filter((chat) => chat.id !== chatId);
      let newCurrentChatId = state.currentChatId;
      let newLatestActiveChatId = state.latestActiveChatId;

      if (state.currentChatId === chatId) {
        newCurrentChatId = null;
      }

      if (state.latestActiveChatId === chatId) {
        newLatestActiveChatId = newChats.length > 0 ? newChats[0].id : null;
      }

      persistChats(newChats);
      if (newCurrentChatId) {
        localStorage.setItem(ACTIVE_CHAT_ID_KEY, newCurrentChatId);
      } else {
        localStorage.removeItem(ACTIVE_CHAT_ID_KEY);
      }
      return {
        ...state,
        chats: newChats,
        currentChatId: newCurrentChatId,
        latestActiveChatId: newLatestActiveChatId,
      };
    });
  },

  deleteChats: async (chatIds) => {
    const chatsToDelete = get().chats.filter((chat) => chatIds.includes(chat.id));
    const sessionIds = getAgentSessionIds(chatsToDelete);

    for (const sessionId of sessionIds) {
      await deleteBackendSession(sessionId);
    }

    // Update local state
    set((state) => {
      const newChats = state.chats.filter((chat) => !chatIds.includes(chat.id));
      let newCurrentChatId = state.currentChatId;
      let newLatestActiveChatId = state.latestActiveChatId;

      if (chatIds.includes(state.currentChatId || "")) {
        newCurrentChatId = null;
      }

      if (chatIds.includes(state.latestActiveChatId || "")) {
        newLatestActiveChatId = newChats.length > 0 ? newChats[0].id : null;
      }

      persistChats(newChats);
      if (newCurrentChatId) {
        localStorage.setItem(ACTIVE_CHAT_ID_KEY, newCurrentChatId);
      } else {
        localStorage.removeItem(ACTIVE_CHAT_ID_KEY);
      }
      return {
        ...state,
        chats: newChats,
        currentChatId: newCurrentChatId,
        latestActiveChatId: newLatestActiveChatId,
      };
    });
  },

  updateChat: (chatId, updates) => {
    set((state) => {
      const chats = state.chats.map((chat) =>
        chat.id === chatId ? { ...chat, ...updates } : chat,
      );
      persistChats(chats);
      return {
        ...state,
        chats,
      };
    });
  },

  pinChat: (chatId) => {
    get().updateChat(chatId, { pinned: true });
  },

  unpinChat: (chatId) => {
    get().updateChat(chatId, { pinned: false });
  },

  // Message management (now operates on the messages array within each ChatItem)
  setMessages: (chatId, messages) => {
    const chat = get().chats.find((c) => c.id === chatId);
    if (chat) {
      get().updateChat(chatId, { messages });
    }
  },

  addMessage: async (chatId, message) => {
    const chat = get().chats.find((c) => c.id === chatId);
    if (chat) {
      const updatedMessages = [...chat.messages, message];
      get().updateChat(chatId, { messages: updatedMessages });
    }
  },

  updateMessage: (chatId, messageId, updates) => {
    const chat = get().chats.find((c) => c.id === chatId);
    if (chat) {
      const updatedMessages = chat.messages.map((msg) => {
        if (msg.id === messageId) {
          // Perform a type-safe update by only applying properties that exist on the original message.
          const updatedMsg = { ...msg };
          Object.keys(updates).forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(updatedMsg, key)) {
              (updatedMsg as any)[key] = (updates as any)[key];
            }
          });
          return updatedMsg;
        }
        return msg;
      });
      get().updateChat(chatId, { messages: updatedMessages });
    }
  },

  deleteMessage: (chatId, messageId) => {
    const chat = get().chats.find((c) => c.id === chatId);
    if (chat) {
      const updatedMessages = chat.messages.filter(
        (msg) => msg.id !== messageId,
      );
      get().updateChat(chatId, { messages: updatedMessages });
    }
  },

  loadChats: async () => {
    const storedChats = loadChatsFromStorage();
    const activeChatId = localStorage.getItem(ACTIVE_CHAT_ID_KEY);
    const storedAutoTitles = localStorage.getItem(AUTO_TITLE_KEY);
    const autoGenerateTitles =
      storedAutoTitles === null
        ? get().autoGenerateTitles
        : storedAutoTitles === "true";

    let currentChatId = activeChatId;
    let latestActiveChatId = activeChatId;
    if (!currentChatId && storedChats.length > 0) {
      currentChatId = storedChats[0].id;
      latestActiveChatId = storedChats[0].id;
    }

    set({
      chats: storedChats,
      latestActiveChatId,
      currentChatId,
      isProcessing: false,
      autoGenerateTitles,
    });
  },

  setProcessing: (isProcessing) => {
    set({ isProcessing });
  },

  setAutoGenerateTitlesPreference: async (enabled) => {
    const previousValue = get().autoGenerateTitles;
    set({ autoGenerateTitles: enabled, isUpdatingAutoTitlePreference: true });
    try {
      localStorage.setItem(AUTO_TITLE_KEY, String(enabled));
    } catch (error) {
      console.warn(
        "[ChatSlice] Failed to update auto-generate titles preference:",
        error,
      );
      set({ autoGenerateTitles: previousValue });
      throw error;
    } finally {
      set({ isUpdatingAutoTitlePreference: false });
    }
  },
});

const loadChatsFromStorage = (): ChatItem[] => {
  try {
    const stored = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Failed to load chats from localStorage:", error);
    return [];
  }
};

const persistChats = (chats: ChatItem[]): void => {
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chats));
  } catch (error) {
    console.error("Failed to save chats to localStorage:", error);
  }
};

const getAgentSessionId = (chat?: ChatItem): string | null => {
  const sessionId = chat?.config?.agentSessionId?.trim();
  return sessionId ? sessionId : null;
};

const getAgentSessionIds = (chats: ChatItem[]): string[] => {
  const sessionIds = new Set<string>();

  chats.forEach((chat) => {
    const sessionId = getAgentSessionId(chat);
    if (sessionId) {
      sessionIds.add(sessionId);
    }
  });

  return [...sessionIds];
};

const deleteBackendSession = async (sessionId: string | null): Promise<void> => {
  if (!sessionId) {
    return;
  }

  try {
    await agentClient.deleteSession(sessionId);
    console.log(`[ChatSlice] Successfully deleted backend session ${sessionId}`);
  } catch (error) {
    console.error(
      `[ChatSlice] Failed to delete backend session ${sessionId}:`,
      error,
    );
  }
};
