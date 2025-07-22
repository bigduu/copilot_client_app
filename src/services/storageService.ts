import { ChatItem, Message, SystemPromptPreset } from '../types/chat';

const STORAGE_KEYS = {
  CHATS: 'copilot_chats',
  MESSAGES: 'copilot_messages',
  SYSTEM_PROMPTS: 'copilot_system_prompts',
  SETTINGS: 'copilot_settings'
};

export const StorageService = {
  /**
   * Load chats from localStorage
   */
  async loadChats(): Promise<ChatItem[]> {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CHATS);
      if (!stored) return [];
      
      const chats = JSON.parse(stored);
      // Convert date strings back to Date objects
      return chats.map((chat: any) => ({
        ...chat,
        createdAt: new Date(chat.createdAt),
        updatedAt: new Date(chat.updatedAt)
      }));
    } catch (error) {
      console.error('Failed to load chats:', error);
      return [];
    }
  },

  /**
   * Save chats to localStorage
   */
  async saveChats(chats: ChatItem[]): Promise<void> {
    try {
      localStorage.setItem(STORAGE_KEYS.CHATS, JSON.stringify(chats));
    } catch (error) {
      console.error('Failed to save chats:', error);
      throw error;
    }
  },

  /**
   * Load messages from localStorage
   */
  async loadMessages(): Promise<Record<string, Message[]>> {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.MESSAGES);
      if (!stored) return {};
      
      const messages = JSON.parse(stored);
      // Convert date strings back to Date objects
      const result: Record<string, Message[]> = {};
      
      for (const [chatId, msgs] of Object.entries(messages)) {
        result[chatId] = (msgs as any[]).map(msg => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }));
      }
      
      return result;
    } catch (error) {
      console.error('Failed to load messages:', error);
      return {};
    }
  },

  /**
   * Save messages to localStorage
   */
  async saveMessages(messages: Record<string, Message[]>): Promise<void> {
    try {
      localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));
    } catch (error) {
      console.error('Failed to save messages:', error);
      throw error;
    }
  },

  /**
   * Load system prompt presets
   */
  async loadSystemPromptPresets(): Promise<SystemPromptPreset[]> {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.SYSTEM_PROMPTS);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to load system prompts:', error);
      return [];
    }
  },

  /**
   * Save system prompt presets
   */
  async saveSystemPromptPresets(presets: SystemPromptPreset[]): Promise<void> {
    try {
      localStorage.setItem(STORAGE_KEYS.SYSTEM_PROMPTS, JSON.stringify(presets));
    } catch (error) {
      console.error('Failed to save system prompts:', error);
      throw error;
    }
  },

  /**
   * Load app settings
   */
  async loadSettings(): Promise<any> {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.error('Failed to load settings:', error);
      return {};
    }
  },

  /**
   * Save app settings
   */
  async saveSettings(settings: any): Promise<void> {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw error;
    }
  },

  /**
   * Clear all stored data
   */
  async clearAll(): Promise<void> {
    try {
      Object.values(STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
      });
    } catch (error) {
      console.error('Failed to clear storage:', error);
      throw error;
    }
  }
};
