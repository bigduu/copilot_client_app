import { ChatItem, Message } from '../types/chat';

/**
 * Optimized Storage Service
 * 
 * This service optimizes storage by:
 * 1. Storing each chat's messages separately
 * 2. Loading messages on-demand
 * 3. Reducing memory usage and improving performance
 */

const STORAGE_KEYS = {
  CHATS: 'copilot_chats_v2', // New version to avoid conflicts
  CHAT_INDEX: 'copilot_chat_index',
  MESSAGES_PREFIX: 'copilot_messages_',
  LATEST_ACTIVE_CHAT: 'copilot_latest_active_chat_id',
  // Legacy keys for migration
  LEGACY_CHATS: 'copilot_chats',
  LEGACY_MESSAGES: 'copilot_messages',
};

export interface OptimizedChatItem extends Omit<ChatItem, 'messages'> {
  messageCount: number; // Track message count for UI display
  lastMessageAt?: number; // Track last message timestamp
}

export class OptimizedStorageService {
  private static instance: OptimizedStorageService;
  private messageCache = new Map<string, Message[]>(); // In-memory cache for active chats
  private maxCacheSize = 5; // Keep messages for up to 5 chats in memory

  static getInstance(): OptimizedStorageService {
    if (!OptimizedStorageService.instance) {
      OptimizedStorageService.instance = new OptimizedStorageService();
    }
    return OptimizedStorageService.instance;
  }

  /**
   * Load all chats (without messages)
   */
  async loadChats(): Promise<OptimizedChatItem[]> {
    try {
      // Check if we need to migrate from legacy format
      const legacyChats = localStorage.getItem(STORAGE_KEYS.LEGACY_CHATS);
      const newChats = localStorage.getItem(STORAGE_KEYS.CHATS);
      
      if (!newChats && legacyChats) {
        console.log('Migrating from legacy storage format...');
        await this.migrateFromLegacyFormat();
      }

      const stored = localStorage.getItem(STORAGE_KEYS.CHATS);
      if (!stored) return [];
      
      const chats = JSON.parse(stored);
      return chats.map((chat: any) => ({
        ...chat,
        createdAt: typeof chat.createdAt === 'number' ? chat.createdAt : Date.now(),
        toolCategory: chat.toolCategory || 'general_assistant',
        messageCount: chat.messageCount || 0,
      }));
    } catch (error) {
      console.error('Failed to load chats:', error);
      return [];
    }
  }

  /**
   * Save all chats (without messages)
   */
  async saveChats(chats: OptimizedChatItem[]): Promise<void> {
    try {
      localStorage.setItem(STORAGE_KEYS.CHATS, JSON.stringify(chats));
      
      // Update chat index
      const chatIds = chats.map(chat => chat.id);
      localStorage.setItem(STORAGE_KEYS.CHAT_INDEX, JSON.stringify(chatIds));
    } catch (error) {
      console.error('Failed to save chats:', error);
      throw error;
    }
  }

  /**
   * Load messages for a specific chat
   */
  async loadMessages(chatId: string): Promise<Message[]> {
    // Check cache first
    if (this.messageCache.has(chatId)) {
      return this.messageCache.get(chatId)!;
    }

    try {
      const stored = localStorage.getItem(`${STORAGE_KEYS.MESSAGES_PREFIX}${chatId}`);
      const messages = stored ? JSON.parse(stored) : [];
      
      // Add to cache
      this.addToCache(chatId, messages);
      
      return messages;
    } catch (error) {
      console.error(`Failed to load messages for chat ${chatId}:`, error);
      return [];
    }
  }

  /**
   * Save messages for a specific chat
   */
  async saveMessages(chatId: string, messages: Message[]): Promise<void> {
    try {
      localStorage.setItem(`${STORAGE_KEYS.MESSAGES_PREFIX}${chatId}`, JSON.stringify(messages));
      
      // Update cache
      this.addToCache(chatId, messages);
    } catch (error) {
      console.error(`Failed to save messages for chat ${chatId}:`, error);
      throw error;
    }
  }

  /**
   * Delete messages for a specific chat
   */
  async deleteMessages(chatId: string): Promise<void> {
    try {
      localStorage.removeItem(`${STORAGE_KEYS.MESSAGES_PREFIX}${chatId}`);
      this.messageCache.delete(chatId);
    } catch (error) {
      console.error(`Failed to delete messages for chat ${chatId}:`, error);
    }
  }

  /**
   * Delete messages for multiple chats
   */
  async deleteMultipleMessages(chatIds: string[]): Promise<void> {
    for (const chatId of chatIds) {
      await this.deleteMessages(chatId);
    }
  }

  /**
   * Load latest active chat ID
   */
  async loadLatestActiveChatId(): Promise<string | null> {
    try {
      return localStorage.getItem(STORAGE_KEYS.LATEST_ACTIVE_CHAT) || null;
    } catch (error) {
      console.error('Failed to load latest active chat ID:', error);
      return null;
    }
  }

  /**
   * Save latest active chat ID
   */
  async saveLatestActiveChatId(chatId: string | null): Promise<void> {
    try {
      if (chatId) {
        localStorage.setItem(STORAGE_KEYS.LATEST_ACTIVE_CHAT, chatId);
      } else {
        localStorage.removeItem(STORAGE_KEYS.LATEST_ACTIVE_CHAT);
      }
    } catch (error) {
      console.error('Failed to save latest active chat ID:', error);
    }
  }

  /**
   * Get storage usage statistics
   */
  getStorageStats(): { totalChats: number; cacheSize: number; estimatedSize: string } {
    const chatIndex = localStorage.getItem(STORAGE_KEYS.CHAT_INDEX);
    const totalChats = chatIndex ? JSON.parse(chatIndex).length : 0;
    
    // Estimate total storage size
    let totalSize = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('copilot_')) {
        const value = localStorage.getItem(key);
        totalSize += (key.length + (value?.length || 0)) * 2; // Rough estimate in bytes
      }
    }
    
    return {
      totalChats,
      cacheSize: this.messageCache.size,
      estimatedSize: `${(totalSize / 1024).toFixed(1)} KB`,
    };
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    this.messageCache.clear();
  }

  /**
   * Add messages to cache with LRU eviction
   */
  private addToCache(chatId: string, messages: Message[]): void {
    // Remove if already exists to update position
    if (this.messageCache.has(chatId)) {
      this.messageCache.delete(chatId);
    }
    
    // Add to cache
    this.messageCache.set(chatId, messages);
    
    // Evict oldest if cache is full
    if (this.messageCache.size > this.maxCacheSize) {
      const firstKey = this.messageCache.keys().next().value;
      this.messageCache.delete(firstKey);
    }
  }

  /**
   * Migrate from legacy storage format
   */
  private async migrateFromLegacyFormat(): Promise<void> {
    try {
      console.log('Starting migration from legacy format...');
      
      // Load legacy data
      const legacyChatsStr = localStorage.getItem(STORAGE_KEYS.LEGACY_CHATS);
      const legacyMessagesStr = localStorage.getItem(STORAGE_KEYS.LEGACY_MESSAGES);
      
      if (!legacyChatsStr) return;
      
      const legacyChats: ChatItem[] = JSON.parse(legacyChatsStr);
      const legacyMessages: Record<string, Message[]> = legacyMessagesStr 
        ? JSON.parse(legacyMessagesStr) 
        : {};

      // Convert to new format
      const optimizedChats: OptimizedChatItem[] = legacyChats.map(chat => {
        const messages = legacyMessages[chat.id] || [];
        return {
          id: chat.id,
          title: chat.title,
          createdAt: chat.createdAt,
          systemPrompt: chat.systemPrompt,
          systemPromptId: chat.systemPromptId,
          toolCategory: chat.toolCategory || 'general_assistant',
          pinned: chat.pinned || false,
          model: chat.model,
          messageCount: messages.length,
          lastMessageAt: messages.length > 0 ? Date.now() : undefined,
        };
      });

      // Save new format
      await this.saveChats(optimizedChats);
      
      // Save messages separately
      for (const chat of legacyChats) {
        const messages = legacyMessages[chat.id] || [];
        if (messages.length > 0) {
          await this.saveMessages(chat.id, messages);
        }
      }

      console.log(`Migration completed: ${optimizedChats.length} chats migrated`);
      
      // Keep legacy data for now (don't delete in case of issues)
      // We can add a cleanup function later
      
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  }
}
