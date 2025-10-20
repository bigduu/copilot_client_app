import { ChatItem, Message, UserSystemPrompt } from "../types/chat";

/**
 * Optimized Storage Service V2
 *
 * This service is aligned with the ChatItem V2 data structure.
 * It stores chat metadata and messages separately for performance.
 */

const STORAGE_KEYS = {
  CHATS: "copilot_chats_v2", // Key for storing chat metadata
  MESSAGES_PREFIX: "copilot_messages_v2_", // Prefix for individual chat messages
  LATEST_ACTIVE_CHAT: "copilot_latest_active_chat_id_v2",
  SYSTEM_PROMPTS: "copilot_system_prompts_v1", // Key for storing user-defined system prompts
};

// This interface represents the data that is actually saved to localStorage for each chat.
// It's a "dehydrated" version of ChatItem, without the transient `messages` and `currentInteraction` state.
export interface OptimizedChatItem {
  id: string;
  title: string;
  createdAt: number;
  pinned?: boolean;
  config: ChatItem["config"]; // Store the entire config object
  messageCount: number;
  lastMessageAt?: number;
}

export class StorageService {
  private messageCache = new Map<string, Message[]>();
  private maxCacheSize = 5;

  /**
   * Loads all chat metadata and hydrates them into full ChatItem objects.
   * Messages are not loaded here; they are loaded on-demand when a chat is selected.
   */
  async loadAllData(): Promise<{
    chats: ChatItem[];
    messages: Record<string, Message[]>;
  }> {
    try {
      const optimizedChats = await this.loadChats();

      // Hydrate the optimized chats into full ChatItem objects for the store.
      // Initialize with empty messages and null interaction state.
      const chats: ChatItem[] = optimizedChats.map((chat) => ({
        ...chat,
        messages: [], // Messages will be loaded on-demand
        currentInteraction: null, // This is always transient state
      }));

      // The messages record is no longer pre-loaded for all chats.
      // Return an empty object to match the expected signature.
      return { chats, messages: {} };
    } catch (error) {
      console.error("Failed to load all data:", error);
      return { chats: [], messages: {} };
    }
  }

  /**
   * Saves the metadata for all chats and the messages for currently active chats.
   */
  async saveAllData(chats: ChatItem[]): Promise<void> {
    try {
      // Dehydrate the full ChatItem objects into OptimizedChatItem for storage.
      const optimizedChats: OptimizedChatItem[] = chats.map((chat) => ({
        id: chat.id,
        title: chat.title,
        createdAt: chat.createdAt,
        pinned: chat.pinned,
        config: chat.config, // Save the entire config object
        messageCount: chat.messages.length,
        lastMessageAt:
          chat.messages.length > 0
            ? new Date(
                chat.messages[chat.messages.length - 1].createdAt
              ).getTime()
            : chat.createdAt,
      }));

      await this.saveChats(optimizedChats);

      // The `messages` parameter is now deprecated for this function,
      // as messages are saved directly with `saveMessages`.
      // However, we can iterate through the provided chats to save their messages.
      for (const chat of chats) {
        if (chat.messages.length > 0) {
          await this.saveMessages(chat.id, chat.messages);
        }
      }
    } catch (error) {
      console.error("Failed to save all data:", error);
    }
  }

  /**
   * Loads only the chat metadata (OptimizedChatItem) from localStorage.
   */
  private async loadChats(): Promise<OptimizedChatItem[]> {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CHATS);
      if (!stored) return [];

      const chats = JSON.parse(stored) as OptimizedChatItem[];
      // Basic validation can be done here if needed
      return chats;
    } catch (error) {
      console.error("Failed to load chats:", error);
      return [];
    }
  }

  /**
   * Saves the chat metadata array to localStorage.
   */
  private async saveChats(chats: OptimizedChatItem[]): Promise<void> {
    try {
      localStorage.setItem(STORAGE_KEYS.CHATS, JSON.stringify(chats));
    } catch (error) {
      console.error("Failed to save chats:", error);
      throw error;
    }
  }

  /**
   * Load messages for a specific chat, from cache or localStorage.
   */
  async loadMessages(chatId: string): Promise<Message[]> {
    if (this.messageCache.has(chatId)) {
      return this.messageCache.get(chatId)!;
    }

    try {
      const stored = localStorage.getItem(
        `${STORAGE_KEYS.MESSAGES_PREFIX}${chatId}`
      );
      const messages = stored ? JSON.parse(stored) : [];
      this.addToCache(chatId, messages);
      return messages;
    } catch (error) {
      console.error(`Failed to load messages for chat ${chatId}:`, error);
      return [];
    }
  }

  /**
   * Save messages for a specific chat to localStorage and update the cache.
   */
  async saveMessages(chatId: string, messages: Message[]): Promise<void> {
    try {
      localStorage.setItem(
        `${STORAGE_KEYS.MESSAGES_PREFIX}${chatId}`,
        JSON.stringify(messages)
      );
      this.addToCache(chatId, messages);
    } catch (error) {
      console.error(`Failed to save messages for chat ${chatId}:`, error);
      throw error;
    }
  }

  /**
   * Delete messages for a specific chat from localStorage and cache.
   */
  async deleteMessages(chatId: string): Promise<void> {
    try {
      localStorage.removeItem(`${STORAGE_KEYS.MESSAGES_PREFIX}${chatId}`);
      this.messageCache.delete(chatId);
    } catch (error) {
      console.error(`Failed to delete messages for chat ${chatId}:`, error);
    }
  }

  async deleteMultipleMessages(chatIds: string[]): Promise<void> {
    for (const chatId of chatIds) {
      await this.deleteMessages(chatId);
    }
  }

  async loadLatestActiveChatId(): Promise<string | null> {
    try {
      return localStorage.getItem(STORAGE_KEYS.LATEST_ACTIVE_CHAT) || null;
    } catch (error) {
      console.error("Failed to load latest active chat ID:", error);
      return null;
    }
  }

  async saveLatestActiveChatId(chatId: string | null): Promise<void> {
    try {
      if (chatId) {
        localStorage.setItem(STORAGE_KEYS.LATEST_ACTIVE_CHAT, chatId);
      } else {
        localStorage.removeItem(STORAGE_KEYS.LATEST_ACTIVE_CHAT);
      }
    } catch (error) {
      console.error("Failed to save latest active chat ID:", error);
    }
  }

  getStorageStats(): {
    totalChats: number;
    cacheSize: number;
    estimatedSize: string;
  } {
    const chatsStr = localStorage.getItem(STORAGE_KEYS.CHATS);
    const totalChats = chatsStr
      ? (JSON.parse(chatsStr) as OptimizedChatItem[]).length
      : 0;

    let totalSize = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("copilot_")) {
        const value = localStorage.getItem(key);
        totalSize += (key.length + (value?.length || 0)) * 2;
      }
    }

    return {
      totalChats,
      cacheSize: this.messageCache.size,
      estimatedSize: `${(totalSize / 1024).toFixed(1)} KB`,
    };
  }

  clearCache(): void {
    this.messageCache.clear();
  }

  private addToCache(chatId: string, messages: Message[]): void {
    if (this.messageCache.has(chatId)) {
      this.messageCache.delete(chatId);
    }
    this.messageCache.set(chatId, messages);

    if (this.messageCache.size > this.maxCacheSize) {
      const firstKey = this.messageCache.keys().next().value;
      if (firstKey !== undefined) {
        this.messageCache.delete(firstKey);
      }
    }
  }

  // --- System Prompt Management ---

  async getSystemPrompts(): Promise<UserSystemPrompt[]> {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.SYSTEM_PROMPTS);
      if (!stored) return []; // Return empty array if nothing is stored yet

      const prompts = JSON.parse(stored) as UserSystemPrompt[];
      // Optional: Add validation here
      return prompts;
    } catch (error) {
      console.error("Failed to load system prompts:", error);
      return [];
    }
  }

  async saveSystemPrompts(prompts: UserSystemPrompt[]): Promise<void> {
    try {
      localStorage.setItem(
        STORAGE_KEYS.SYSTEM_PROMPTS,
        JSON.stringify(prompts)
      );
    } catch (error) {
      console.error("Failed to save system prompts:", error);
      throw error;
    }
  }
}
