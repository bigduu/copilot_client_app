import { v4 as uuidv4 } from "uuid";
import { ChatItem, Message } from "../types/chat";
import { generateChatTitle } from "../utils/chatUtils";
import { DEFAULT_MESSAGE } from "../constants";

const STORAGE_KEY = "copilot_chats";
const SYSTEM_PROMPT_KEY = "system_prompt";
const FALLBACK_MODEL_IN_CHATS = "gpt-4o";

/**
 * ChatService 处理聊天相关的核心业务逻辑
 * 包括聊天的增删改查、消息管理、持久化等
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
   * 从本地存储加载聊天数据
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
   * 保存聊天数据到本地存储
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
   * 创建新聊天
   */
  createChat(firstUserMessageContent?: string, defaultModel?: string): ChatItem {
    const newChatId = uuidv4();
    const currentSystemPrompt =
      localStorage.getItem(SYSTEM_PROMPT_KEY) || DEFAULT_MESSAGE;
    const newChatModel = defaultModel || FALLBACK_MODEL_IN_CHATS;

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
   * 删除单个聊天
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
   * 批量删除聊天
   */
  deleteChats(chatIds: string[], chats: ChatItem[]): ChatItem[] {
    return chats.filter((chat) => !chatIds.includes(chat.id));
  }

  /**
   * 删除所有聊天（保留固定的）
   */
  deleteAllChats(chats: ChatItem[]): ChatItem[] {
    return chats.filter((chat) => chat.pinned);
  }

  /**
   * 删除空聊天（未固定的）
   */
  deleteEmptyChats(chats: ChatItem[]): ChatItem[] {
    return chats.filter((chat) => chat.pinned || chat.messages.length > 0);
  }

  /**
   * 固定聊天
   */
  pinChat(chatId: string, chats: ChatItem[]): ChatItem[] {
    return chats.map((chat) =>
      chat.id === chatId ? { ...chat, pinned: true } : chat
    );
  }

  /**
   * 取消固定聊天
   */
  unpinChat(chatId: string, chats: ChatItem[]): ChatItem[] {
    return chats.map((chat) =>
      chat.id === chatId ? { ...chat, pinned: false } : chat
    );
  }

  /**
   * 更新聊天消息
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
                ? newMessages[0].content.substring(0, 30) +
                  (newMessages[0].content.length > 30 ? "..." : "")
                : chat.title,
          }
        : chat
    );
  }

  /**
   * 更新聊天的系统提示
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
   * 更新聊天的模型
   */
  updateChatModel(chatId: string, model: string, chats: ChatItem[]): ChatItem[] {
    return chats.map((chat) =>
      chat.id === chatId ? { ...chat, model } : chat
    );
  }

  /**
   * 更新聊天信息
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
   * 获取当前聊天
   */
  getCurrentChat(currentChatId: string | null, chats: ChatItem[]): ChatItem | null {
    if (!currentChatId) return null;
    return chats.find((chat) => chat.id === currentChatId) || null;
  }

  /**
   * 获取当前聊天的消息
   */
  getCurrentMessages(currentChatId: string | null, chats: ChatItem[]): Message[] {
    const currentChat = this.getCurrentChat(currentChatId, chats);
    return currentChat?.messages || [];
  }

  /**
   * 选择下一个聊天（当当前聊天被删除时）
   */
  selectNextChat(chats: ChatItem[]): string | null {
    if (chats.length === 0) return null;
    const sortedChats = [...chats].sort((a, b) => b.createdAt - a.createdAt);
    return sortedChats[0].id;
  }

  /**
   * 迁移旧版本的聊天数据
   */
  private migrateExistingChats(chats: ChatItem[]): ChatItem[] {
    return chats.map((chat) => {
      if (chat.systemPrompt) return chat; // Already migrated

      // Look for system message in existing messages
      const systemMessage = chat.messages.find((m) => m.role === "system");
      return {
        ...chat,
        systemPrompt:
          systemMessage?.content ||
          localStorage.getItem(SYSTEM_PROMPT_KEY) ||
          DEFAULT_MESSAGE,
      };
    });
  }
}
