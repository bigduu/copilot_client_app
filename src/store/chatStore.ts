import { create } from 'zustand';
import { ChatItem, Message, SystemPromptPreset, createTextContent } from '../types/chat';
// import { tauriService } from '../services/tauriService';
// import { storageService } from '../services/storageService';

// 临时的简化存储服务
const tempStorageService = {
  async loadChats(): Promise<ChatItem[]> {
    try {
      const stored = localStorage.getItem('copilot_chats');
      if (!stored) return [];
      const chats = JSON.parse(stored);
      return chats.map((chat: any) => ({
        ...chat,
        createdAt: typeof chat.createdAt === 'number' ? chat.createdAt : Date.now(),
        toolCategory: chat.toolCategory || 'general_assistant',
      }));
    } catch (error) {
      console.error('Failed to load chats:', error);
      return [];
    }
  },

  async saveChats(chats: ChatItem[]): Promise<void> {
    try {
      localStorage.setItem('copilot_chats', JSON.stringify(chats));
    } catch (error) {
      console.error('Failed to save chats:', error);
    }
  },

  async loadMessages(): Promise<Record<string, Message[]>> {
    try {
      const stored = localStorage.getItem('copilot_messages');
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.error('Failed to load messages:', error);
      return {};
    }
  },

  async saveMessages(messages: Record<string, Message[]>): Promise<void> {
    try {
      localStorage.setItem('copilot_messages', JSON.stringify(messages));
    } catch (error) {
      console.error('Failed to save messages:', error);
    }
  },

  async loadLatestActiveChatId(): Promise<string | null> {
    try {
      const stored = localStorage.getItem('copilot_latest_active_chat_id');
      return stored || null;
    } catch (error) {
      console.error('Failed to load latest active chat ID:', error);
      return null;
    }
  },

  async saveLatestActiveChatId(chatId: string | null): Promise<void> {
    try {
      if (chatId) {
        localStorage.setItem('copilot_latest_active_chat_id', chatId);
      } else {
        localStorage.removeItem('copilot_latest_active_chat_id');
      }
    } catch (error) {
      console.error('Failed to save latest active chat ID:', error);
    }
  },
};

interface ChatState {
  // State
  chats: ChatItem[];
  currentChatId: string | null;
  latestActiveChatId: string | null; // Store the last active chat ID
  messages: Record<string, Message[]>;
  systemPromptPresets: SystemPromptPreset[];
  isProcessing: boolean;

  // Actions
  addChat: (chat: Omit<ChatItem, 'id'>) => void;
  selectChat: (chatId: string) => void;
  deleteChat: (chatId: string) => void;
  deleteChats: (chatIds: string[]) => void;
  updateChat: (chatId: string, updates: Partial<ChatItem>) => void;
  pinChat: (chatId: string) => void;
  unpinChat: (chatId: string) => void;
  
  addMessage: (chatId: string, message: Message) => void;
  updateMessage: (chatId: string, messageId: string, updates: Partial<Message>) => void;
  
  loadChats: () => Promise<void>;
  saveChats: () => Promise<void>;

  loadSystemPromptPresets: () => Promise<void>;
  setSystemPromptPresets: (presets: SystemPromptPreset[]) => void;

  initiateAIResponse: (chatId: string, userMessage: string) => Promise<void>;
  triggerAIResponseOnly: (chatId: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  // Initial state
  chats: [],
  currentChatId: null,
  latestActiveChatId: null,
  messages: {},
  systemPromptPresets: [],
  isProcessing: false,

  // Chat management actions
  addChat: (chatData) => {
    const newChat: ChatItem = {
      ...chatData,
      id: Date.now().toString(),
      createdAt: chatData.createdAt || Date.now(),
      pinned: false,
      toolCategory: chatData.toolCategory || "general_assistant", // 默认工具类别
      systemPromptId: chatData.systemPromptId || "general_assistant", // 默认系统提示词ID
    };

    set(state => ({
      chats: [...state.chats, newChat],
      currentChatId: newChat.id,
      latestActiveChatId: newChat.id,
      messages: { ...state.messages, [newChat.id]: chatData.messages || [] }
    }));

    // Auto-save
    get().saveChats();
  },

  selectChat: (chatId) => {
    set({ currentChatId: chatId, latestActiveChatId: chatId });
  },

  deleteChat: (chatId) => {
    set(state => {
      const newChats = state.chats.filter(chat => chat.id !== chatId);
      const newMessages = { ...state.messages };
      delete newMessages[chatId];

      // Update currentChatId and latestActiveChatId
      let newCurrentChatId = state.currentChatId;
      let newLatestActiveChatId = state.latestActiveChatId;

      if (state.currentChatId === chatId) {
        newCurrentChatId = null;
      }

      if (state.latestActiveChatId === chatId) {
        // If we're deleting the latest active chat, set it to the first available chat or null
        newLatestActiveChatId = newChats.length > 0 ? newChats[0].id : null;
      }

      return {
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

      // Update currentChatId and latestActiveChatId
      let newCurrentChatId = state.currentChatId;
      let newLatestActiveChatId = state.latestActiveChatId;

      if (chatIds.includes(state.currentChatId || '')) {
        newCurrentChatId = null;
      }

      if (chatIds.includes(state.latestActiveChatId || '')) {
        // If we're deleting the latest active chat, set it to the first available chat or null
        newLatestActiveChatId = newChats.length > 0 ? newChats[0].id : null;
      }

      return {
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
      messages: {
        ...state.messages,
        [chatId]: [...(state.messages[chatId] || []), message]
      }
    }));

    // Auto-save messages to storage
    get().saveChats();
  },

  updateMessage: (chatId, messageId, updates) => {
    set(state => {
      const currentMessages = state.messages[chatId] || [];
      const messageExists = currentMessages.some(msg => msg.id === messageId);

      if (!messageExists) {
        console.warn(`Message ${messageId} not found in chat ${chatId}`);
        return state; // Don't update if message doesn't exist
      }

      return {
        messages: {
          ...state.messages,
          [chatId]: currentMessages.map(msg =>
            msg.id === messageId ? { ...msg, ...updates } : msg
          )
        }
      };
    });

    // Auto-save messages to storage
    get().saveChats();
  },

  // Data persistence
  loadChats: async () => {
    try {
      const chats = await tempStorageService.loadChats();
      const messages = await tempStorageService.loadMessages();
      const latestActiveChatId = await tempStorageService.loadLatestActiveChatId();

      // 为没有 systemPromptId 的现有聊天设置默认值
      const migratedChats = chats.map(chat => {
        if (!chat.systemPromptId) {
          // 为现有聊天设置默认的通用助手系统提示词ID
          return {
            ...chat,
            systemPromptId: 'general_assistant',
            toolCategory: chat.toolCategory || 'general_assistant',
          };
        }
        return chat;
      });

      // 自动选择上一次的活跃聊天
      let currentChatId = null;
      if (latestActiveChatId && migratedChats.some(chat => chat.id === latestActiveChatId)) {
        // 如果上一次的活跃聊天仍然存在，则选择它
        currentChatId = latestActiveChatId;
      } else if (migratedChats.length > 0) {
        // 否则选择第一个聊天
        currentChatId = migratedChats[0].id;
      }

      set({
        chats: migratedChats,
        messages,
        latestActiveChatId: latestActiveChatId,
        currentChatId: currentChatId
      });
    } catch (error) {
      console.error('Failed to load chats:', error);
      set({ chats: [], messages: {}, latestActiveChatId: null, currentChatId: null });
    }
  },

  saveChats: async () => {
    try {
      const { chats, messages, latestActiveChatId } = get();
      await tempStorageService.saveChats(chats);
      await tempStorageService.saveMessages(messages);
      await tempStorageService.saveLatestActiveChatId(latestActiveChatId);
    } catch (error) {
      console.error('Failed to save chats:', error);
    }
  },

  // System prompt presets management
  loadSystemPromptPresets: async () => {
    try {
      // 直接调用后端的 get_tool_categories 命令
      const { invoke } = await import('@tauri-apps/api/core');
      const categories = await invoke<any[]>('get_tool_categories');

      // 将后端类别转换为前端 SystemPromptPreset 格式
      const presets: SystemPromptPreset[] = categories.map((category) => ({
        id: category.id,
        name: category.display_name || category.name,
        content: category.system_prompt,
        description: category.description,
        category: category.id,
        mode: category.restrict_conversation ? 'tool_specific' : 'general',
        autoToolPrefix: category.auto_prefix,
        allowedTools: category.tools || [],
        restrictConversation: category.restrict_conversation || false,
      }));

      set({ systemPromptPresets: presets });
      console.log('Successfully loaded system prompt presets from backend:', presets);
    } catch (error) {
      console.error('Failed to load system prompt presets from backend:', error);
      // 如果后端调用失败，设置空数组
      set({ systemPromptPresets: [] });
    }
  },

  setSystemPromptPresets: (presets) => {
    set({ systemPromptPresets: presets });
  },

  // AI interaction - 调用真正的 AI 服务
  initiateAIResponse: async (chatId, userMessage) => {
    const { addMessage, messages, chats } = get();

    // Add user message
    const userMsg: Message = {
      id: Date.now().toString(),
      content: createTextContent(userMessage),
      role: 'user',
    };
    addMessage(chatId, userMsg);

    set({ isProcessing: true });

    try {
      // 获取当前聊天的所有消息（包括刚添加的用户消息）
      const chatMessages = messages[chatId] || [];
      const currentChat = chats.find(chat => chat.id === chatId);

      // 构建发送给 AI 的消息列表，包含系统提示
      const messagesToSend: Message[] = [];

      // 添加系统消息（如果存在）
      if (currentChat?.systemPrompt) {
        messagesToSend.push({
          role: 'system',
          content: currentChat.systemPrompt,
          id: 'system',
        });
      }

      // 添加所有聊天消息
      messagesToSend.push(...chatMessages);

      // 调用 Tauri 后端的 execute_prompt 命令
      const { invoke } = await import('@tauri-apps/api/core');
      const { Channel } = await import('@tauri-apps/api/core');

      // 创建流式响应通道
      const channel = new Channel<string>();
      let assistantResponse = '';

      // Generate unique turn ID to avoid updating previous messages
      const turnId = Date.now();
      let isStreamingComplete = false;

      // 监听流式响应
      channel.onmessage = (rawMessage) => {
        // 处理 [DONE] 信号
        if (rawMessage.trim() === '[DONE]') {
          return;
        }

        // 跳过空消息
        if (!rawMessage || rawMessage.trim() === '') {
          return;
        }

        // 分割多个 JSON 对象并处理每个
        const jsonObjects = rawMessage.split(/(?<=})\s*(?={)/);

        for (const jsonStr of jsonObjects) {
          if (!jsonStr.trim()) continue;

          try {
            const response = JSON.parse(jsonStr);

            // 处理正常的流式响应
            if (response.choices && response.choices.length > 0) {
              const choice = response.choices[0];

              // 检查是否是完成信号
              if (choice.finish_reason === 'stop') {
                return;
              }

              // 处理增量内容
              if (choice.delta && typeof choice.delta.content !== 'undefined') {
                if (choice.delta.content !== null && typeof choice.delta.content === 'string') {
                  const newContent = choice.delta.content;

                  // 累积内容
                  assistantResponse += newContent;

                  // 实时更新 AI 响应消息
                  // Use the turn ID generated at the beginning to avoid updating previous messages
                  const messageId = `ai-${chatId}-${turnId}`;
                  const assistantMsg: Message = {
                    id: messageId,
                    content: assistantResponse,
                    role: 'assistant',
                  };

                  // 更新或添加 AI 消息 - only look for messages from this specific turn
                  const currentMessages = get().messages[chatId] || [];
                  const existingMsg = currentMessages.find(msg => msg.id === messageId);

                  if (existingMsg) {
                    // Only update if content has actually changed to prevent infinite loops
                    if (existingMsg.content !== assistantResponse && !isStreamingComplete) {
                      get().updateMessage(chatId, messageId, { content: assistantResponse });
                    }
                  } else {
                    // 添加新消息
                    addMessage(chatId, assistantMsg);
                  }
                }
              }
            }
          } catch (parseError) {
            console.error('[chatStore] Failed to parse JSON:', parseError);
            console.error('[chatStore] JSON string:', jsonStr);
          }
        }
      };

      // 调用后端 AI 服务
      await invoke('execute_prompt', {
        messages: messagesToSend,
        model: currentChat?.model || null,
        channel,
      });

      set({ isProcessing: false });
    } catch (error) {
      console.error('AI response failed:', error);
      // Add error message
      addMessage(chatId, {
        id: (Date.now() + 1).toString(),
        content: 'Sorry, I encountered an error while processing your request. Please try again.',
        role: 'assistant',
      });
      set({ isProcessing: false });
    }
  },

  // AI response without creating user message (for cases where user message already exists)
  triggerAIResponseOnly: async (chatId) => {
    const { addMessage, messages, chats } = get();

    set({ isProcessing: true });

    try {
      // 获取当前聊天的所有消息（用户消息应该已经存在）
      const chatMessages = messages[chatId] || [];
      const currentChat = chats.find(chat => chat.id === chatId);

      // 构建发送给 AI 的消息列表，包含系统提示
      const messagesToSend: Message[] = [];

      // 添加系统消息（如果存在）
      if (currentChat?.systemPrompt) {
        messagesToSend.push({
          role: 'system',
          content: currentChat.systemPrompt,
          id: 'system',
        });
      }

      // 添加所有聊天消息
      messagesToSend.push(...chatMessages);

      // 调用 Tauri 后端的 execute_prompt 命令
      const { invoke } = await import('@tauri-apps/api/core');
      const { Channel } = await import('@tauri-apps/api/core');

      // 创建流式响应通道
      const channel = new Channel<string>();
      let assistantResponse = '';

      // Generate unique turn ID to avoid updating previous messages
      const turnId = Date.now();
      let isStreamingComplete = false;

      // 监听流式响应
      channel.onmessage = (rawMessage) => {
        // 处理 [DONE] 信号
        if (rawMessage.trim() === '[DONE]') {
          return;
        }

        // 跳过空消息
        if (!rawMessage || rawMessage.trim() === '') {
          return;
        }

        // 分割多个 JSON 对象并处理每个
        const jsonObjects = rawMessage.split(/(?<=})\s*(?={)/);

        for (const jsonStr of jsonObjects) {
          if (!jsonStr.trim()) continue;

          try {
            const response = JSON.parse(jsonStr);

            // 处理正常的流式响应
            if (response.choices && response.choices.length > 0) {
              const choice = response.choices[0];

              // 检查是否是完成信号
              if (choice.finish_reason === 'stop') {
                return;
              }

              // 处理增量内容
              if (choice.delta && typeof choice.delta.content !== 'undefined') {
                if (choice.delta.content !== null && typeof choice.delta.content === 'string') {
                  const newContent = choice.delta.content;

                  // 累积内容
                  assistantResponse += newContent;

                  // 实时更新 AI 响应消息
                  // Use the turn ID generated at the beginning to avoid updating previous messages
                  const messageId = `ai-${chatId}-${turnId}`;
                  const assistantMsg: Message = {
                    id: messageId,
                    content: assistantResponse,
                    role: 'assistant',
                  };

                  // 更新或添加 AI 消息 - only look for messages from this specific turn
                  const currentMessages = get().messages[chatId] || [];
                  const existingMsg = currentMessages.find(msg => msg.id === messageId);

                  if (existingMsg) {
                    // Only update if content has actually changed to prevent infinite loops
                    if (existingMsg.content !== assistantResponse && !isStreamingComplete) {
                      get().updateMessage(chatId, messageId, { content: assistantResponse });
                    }
                  } else {
                    // 添加新消息
                    addMessage(chatId, assistantMsg);
                  }
                }
              }
            }
          } catch (parseError) {
            console.error('[chatStore] Failed to parse JSON:', parseError);
            console.error('[chatStore] JSON string:', jsonStr);
          }
        }
      };

      // 调用后端 AI 服务
      await invoke('execute_prompt', {
        messages: messagesToSend,
        model: currentChat?.model || null,
        channel,
      });

      set({ isProcessing: false });
    } catch (error) {
      console.error('AI response failed:', error);
      // Add error message
      addMessage(chatId, {
        id: (Date.now() + 1).toString(),
        content: 'Sorry, I encountered an error while processing your request. Please try again.',
        role: 'assistant',
      });
      set({ isProcessing: false });
    }
  },
}));

// Convenience hooks for specific data
export const useChats = () => useChatStore(state => state.chats);
export const useCurrentChat = () => {
  const currentChatId = useChatStore(state => state.currentChatId);
  const chats = useChatStore(state => state.chats);
  return chats.find(chat => chat.id === currentChatId) || null;
};
export const useCurrentMessages = () => {
  const currentChatId = useChatStore(state => state.currentChatId);
  const messages = useChatStore(state => state.messages);
  return currentChatId ? messages[currentChatId] || [] : [];
};
export const useLatestActiveChatId = () => useChatStore(state => state.latestActiveChatId);
