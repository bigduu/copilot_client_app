import { v4 as uuidv4 } from "uuid";
import { ChatItem, Message, getMessageText } from "../types/chat";
import { generateChatTitle } from "../utils/chatUtils";

const STORAGE_KEY = "copilot_chats";
const SYSTEM_PROMPT_KEY = "system_prompt";

/**
 * ChatService handles core business logic for chat functionality
 * Including CRUD operations for chats, message management, and data persistence
 */
export class ChatService {
  private static instance: ChatService;

  static getInstance(): ChatService {
    if (!ChatService.instance) {
      ChatService.instance = new ChatService();
    }
    return ChatService.instance;
  }

  /**
   * Load chat data from local storage
   */
  loadChats(): ChatItem[] {
    try {
      const savedChats = localStorage.getItem(STORAGE_KEY);
      if (savedChats) {
        const parsedChats = JSON.parse(savedChats) as ChatItem[];
        return this.migrateExistingChats(parsedChats);
      }
      return [];
    } catch (error) {
      console.error("Failed to load chats from storage:", error);
      return [];
    }
  }

  /**
   * Save chat data to local storage
   */
  saveChats(chats: ChatItem[]): void {
    try {
      const sortedChats = [...chats].sort((a, b) => b.createdAt - a.createdAt);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sortedChats));
    } catch (error) {
      console.error("Failed to save chats to storage:", error);
    }
  }

  /**
   * Create a new chat
   */
  createChat(firstUserMessageContent?: string, defaultModel?: string): ChatItem {
    const newChatId = uuidv4();
    const currentSystemPrompt = localStorage.getItem(SYSTEM_PROMPT_KEY);
    if (!currentSystemPrompt) {
      throw new Error("系统提示词未配置，无法创建聊天");
    }
    if (!defaultModel) {
      throw new Error("模型未配置，无法创建聊天");
    }
    const newChatModel = defaultModel;

    let initialMessages: ChatItem["messages"] = [];
    if (firstUserMessageContent) {
      initialMessages.push({
        role: "user",
        content: firstUserMessageContent,
        id: uuidv4(),
      });
    }

    const newChat: ChatItem = {
      id: newChatId,
      title: firstUserMessageContent
        ? firstUserMessageContent.substring(0, 30) +
          (firstUserMessageContent.length > 30 ? "..." : "")
        : generateChatTitle(1), // This will be updated based on chat count
      messages: initialMessages,
      createdAt: Date.now(),
      systemPrompt: currentSystemPrompt,
      model: newChatModel,
      pinned: false,
    };

    return newChat;
  }

  /**
   * Delete a single chat
   */
  deleteChat(chatId: string, chats: ChatItem[]): {
    updatedChats: ChatItem[];
    needsNewCurrentChat: boolean;
  } {
    const updatedChats = chats.filter((chat) => chat.id !== chatId);
    return {
      updatedChats,
      needsNewCurrentChat: true,
    };
  }

  /**
   * Delete multiple chats in batch
   */
  deleteChats(chatIds: string[], chats: ChatItem[]): ChatItem[] {
    return chats.filter((chat) => !chatIds.includes(chat.id));
  }

  /**
   * Delete all chats (preserve pinned ones)
   */
  deleteAllChats(chats: ChatItem[]): ChatItem[] {
    return chats.filter((chat) => chat.pinned);
  }

  /**
   * Delete empty chats (unpinned ones)
   */
  deleteEmptyChats(chats: ChatItem[]): ChatItem[] {
    return chats.filter((chat) => chat.pinned || chat.messages.length > 0);
  }

  /**
   * Pin a chat
   */
  pinChat(chatId: string, chats: ChatItem[]): ChatItem[] {
    return chats.map((chat) =>
      chat.id === chatId ? { ...chat, pinned: true } : chat
    );
  }

  /**
   * Unpin a chat
   */
  unpinChat(chatId: string, chats: ChatItem[]): ChatItem[] {
    return chats.map((chat) =>
      chat.id === chatId ? { ...chat, pinned: false } : chat
    );
  }

  /**
   * Update chat messages
   */
  updateChatMessages(
    chatId: string,
    newMessages: Message[],
    chats: ChatItem[]
  ): ChatItem[] {
    return chats.map((chat) =>
      chat.id === chatId
        ? {
            ...chat,
            messages: newMessages,
            // Update title if this is the first user message in an empty chat
            title:
              chat.messages.length === 0 &&
              newMessages.length > 0 &&
              newMessages[0].role === "user" &&
              chat.title.startsWith("Chat ")
                ? getMessageText(newMessages[0].content).substring(0, 30) +
                  (getMessageText(newMessages[0].content).length > 30 ? "..." : "")
                : chat.title,
          }
        : chat
    );
  }

  /**
   * Update chat's system prompt
   */
  updateChatSystemPrompt(
    chatId: string,
    systemPrompt: string,
    chats: ChatItem[]
  ): ChatItem[] {
    return chats.map((chat) =>
      chat.id === chatId ? { ...chat, systemPrompt } : chat
    );
  }

  /**
   * Update chat's model
   */
  updateChatModel(chatId: string, model: string, chats: ChatItem[]): ChatItem[] {
    return chats.map((chat) =>
      chat.id === chatId ? { ...chat, model } : chat
    );
  }

  /**
   * Update chat information
   */
  updateChat(
    chatId: string,
    updates: Partial<ChatItem>,
    chats: ChatItem[]
  ): ChatItem[] {
    return chats.map((chat) =>
      chat.id === chatId ? { ...chat, ...updates } : chat
    );
  }

  /**
   * Get current chat
   */
  getCurrentChat(currentChatId: string | null, chats: ChatItem[]): ChatItem | null {
    if (!currentChatId) return null;
    return chats.find((chat) => chat.id === currentChatId) || null;
  }

  /**
   * Get messages of current chat
   */
  getCurrentMessages(currentChatId: string | null, chats: ChatItem[]): Message[] {
    const currentChat = this.getCurrentChat(currentChatId, chats);
    return currentChat?.messages || [];
  }

  /**
   * Select next chat (when current chat is deleted)
   */
  selectNextChat(chats: ChatItem[]): string | null {
    if (chats.length === 0) return null;
    const sortedChats = [...chats].sort((a, b) => b.createdAt - a.createdAt);
    return sortedChats[0].id;
  }

  /**
   * Migrate legacy chat data
   */
  private migrateExistingChats(chats: ChatItem[]): ChatItem[] {
    return chats.map((chat) => {
      if (chat.systemPrompt) return chat; // Already migrated

      // Look for system message in existing messages
      const systemMessage = chat.messages.find((m) => m.role === "system");
      return {
        ...chat,
        systemPrompt:
          (systemMessage ? getMessageText(systemMessage.content) : null) ||
          localStorage.getItem(SYSTEM_PROMPT_KEY) ||
          (() => { throw new Error("系统提示词未配置，无法迁移现有聊天。请配置系统提示词后重试。"); })(),
      };
    });
  }
}
