import { StateCreator } from "zustand";
import { ChatItem, Message } from "../../types/chat";
import { StorageService } from "../../services/StorageService";
import type { AppState } from "../";

export interface ChatSlice {
  // State
  chats: ChatItem[];
  currentChatId: string | null;
  latestActiveChatId: string | null; // Store the last active chat ID
  isProcessing: boolean;
  streamingMessage: { chatId: string; content: string } | null;

  // Actions
  addChat: (chat: Omit<ChatItem, "id">) => void;
  selectChat: (chatId: string | null) => void;
  deleteChat: (chatId: string) => Promise<void>;
  deleteChats: (chatIds: string[]) => Promise<void>;
  updateChat: (chatId: string, updates: Partial<ChatItem>) => void;
  pinChat: (chatId: string) => void;
  unpinChat: (chatId: string) => void;

  addMessage: (chatId: string, message: Message) => void;
  setMessages: (chatId: string, messages: Message[]) => void;
  updateMessage: (
    chatId: string,
    messageId: string,
    updates: Partial<Message>
  ) => void;
  updateMessageContent: (
    chatId: string,
    messageId: string,
    content: string
  ) => void; // New action for streaming
  deleteMessage: (chatId: string, messageId: string) => void;

  loadChats: () => Promise<void>;
  saveChats: () => Promise<void>;

  setProcessing: (isProcessing: boolean) => void;
  setStreamingMessage: (
    streamingMessage: { chatId: string; content: string } | null
  ) => void;
}

export const createChatSlice =
  (storageService: StorageService): StateCreator<AppState, [], [], ChatSlice> =>
  (set, get) => ({
    // Initial state
    chats: [],
    currentChatId: null,
    latestActiveChatId: null,
    isProcessing: false,
    streamingMessage: null,

    // Chat management actions
    addChat: (chatData) => {
      // This function now strictly expects the new ChatItem structure.
      // The ID is generated here, and the rest of the data comes from the input.
      const newChat: ChatItem = {
        id: crypto.randomUUID(), // Use crypto.randomUUID for better uniqueness
        ...chatData,
      };

      set((state) => ({
        ...state,
        chats: [...state.chats, newChat],
        currentChatId: newChat.id,
        latestActiveChatId: newChat.id,
      }));
    },

    selectChat: (chatId) => {
      set({ currentChatId: chatId, latestActiveChatId: chatId });

      // Lazy load messages on chat selection if they are not already loaded.
      if (chatId) {
        const chat = get().chats.find((c) => c.id === chatId);
        // Check if messages are empty and there's an indication they should exist.
        // The presence of messages in storage is implicitly known by the app's logic,
        // so if `messages` is empty, it's safe to try loading.
        if (chat && chat.messages.length === 0) {
          storageService.loadMessages(chatId).then((messages) => {
            if (messages.length > 0) {
              get().updateChat(chatId, { messages });
            }
          });
        }
      }
    },

    deleteChat: async (chatId) => {
      await storageService.deleteMessages(chatId);
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

        return {
          ...state,
          chats: newChats,
          currentChatId: newCurrentChatId,
          latestActiveChatId: newLatestActiveChatId,
        };
      });
    },

    deleteChats: async (chatIds) => {
      await storageService.deleteMultipleMessages(chatIds);
      set((state) => {
        const newChats = state.chats.filter(
          (chat) => !chatIds.includes(chat.id)
        );
        let newCurrentChatId = state.currentChatId;
        let newLatestActiveChatId = state.latestActiveChatId;

        if (chatIds.includes(state.currentChatId || "")) {
          newCurrentChatId = null;
        }

        if (chatIds.includes(state.latestActiveChatId || "")) {
          newLatestActiveChatId = newChats.length > 0 ? newChats[0].id : null;
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
      set((state) => ({
        ...state,
        chats: state.chats.map((chat) =>
          chat.id === chatId ? { ...chat, ...updates } : chat
        ),
      }));
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

    addMessage: (chatId, message) => {
      const chat = get().chats.find((c) => c.id === chatId);
      if (chat) {
        get().updateChat(chatId, { messages: [...chat.messages, message] });
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

    updateMessageContent: (chatId, messageId, content) => {
      const chat = get().chats.find((c) => c.id === chatId);
      if (chat) {
        const updatedMessages = chat.messages.map((msg) => {
          if (msg.id === messageId) {
            if (
              msg.role === "user" ||
              (msg.role === "assistant" && msg.type === "text")
            ) {
              return { ...msg, content };
            }
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
          (msg) => msg.id !== messageId
        );
        get().updateChat(chatId, { messages: updatedMessages });
      }
    },

    // Data persistence
    loadChats: async () => {
      try {
        // 1. Load chat metadata (which have empty messages array)
        const { chats: loadedChats } = await storageService.loadAllData();
        const latestActiveChatId =
          await storageService.loadLatestActiveChatId();

        let currentChatId = null;
        if (
          latestActiveChatId &&
          loadedChats.some((chat) => chat.id === latestActiveChatId)
        ) {
          currentChatId = latestActiveChatId;
        } else if (loadedChats.length > 0) {
          currentChatId = loadedChats[0].id;
        }

        // 2. If there's an active chat, pre-load its messages
        if (currentChatId) {
          const messages = await storageService.loadMessages(currentChatId);
          const chatToUpdate = loadedChats.find(
            (chat) => chat.id === currentChatId
          );
          if (chatToUpdate) {
            chatToUpdate.messages = messages;
          }
        }

        // 3. Set the final state
        set({
          chats: loadedChats, // Now contains messages for the active chat
          latestActiveChatId: currentChatId,
          currentChatId: currentChatId,
          isProcessing: false,
          streamingMessage: null,
        });
      } catch (error) {
        console.error("Failed to load chats:", error);
        // On error, reset to a clean initial state
        set({
          chats: [],
          latestActiveChatId: null,
          currentChatId: null,
          isProcessing: false,
          streamingMessage: null,
        });
      }
    },

    saveChats: async () => {
      try {
        const { chats, latestActiveChatId } = get();
        // The storage service now expects chats to contain their own messages.
        await storageService.saveAllData(chats);
        await storageService.saveLatestActiveChatId(latestActiveChatId);
      } catch (error) {
        console.error("Failed to save chats:", error);
      }
    },

    setProcessing: (isProcessing) => {
      set({ isProcessing });
    },

    setStreamingMessage: (streamingMessage) => {
      set({ streamingMessage });
    },
  });
