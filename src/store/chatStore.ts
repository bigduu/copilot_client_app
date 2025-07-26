import { create } from 'zustand';
import { ChatItem, Message, SystemPromptPreset, FavoriteItem, createTextContent, getMessageText } from '../types/chat';
import { OptimizedStorageService, OptimizedChatItem } from '../services/OptimizedStorageService';
// import { TauriService } from '../services/TauriService';
// import { StorageService } from '../services/StorageService';
import SystemPromptEnhancer from '../services/SystemPromptEnhancer';
import { serviceFactory } from '../services/ServiceFactory';

// Get default category ID from backend (highest priority category)
// const getDefaultCategoryId = async (): Promise<string> => {
//   try {
//     const { invoke } = await import('@tauri-apps/api/core');
//     const categories = await invoke<any[]>('get_tool_categories');

//     // Return the first category (highest priority) as default
//     if (categories.length > 0) {
//       return categories[0].id;
//     }

//     // Fallback if no categories available
//     throw new Error('No categories available from backend');
//   } catch (error) {
//     console.error('Failed to get default category ID:', error);
//     // Emergency fallback - this should not happen in production
//     return 'general_assistant';
//   }
// };

// Use optimized storage service
const storageService = OptimizedStorageService.getInstance();

// Favorites storage service (keeping existing implementation for now)
const favoritesStorageService = {
  async loadFavorites(): Promise<FavoriteItem[]> {
    try {
      const stored = localStorage.getItem('copilot_favorites');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to load favorites:', error);
      return [];
    }
  },

  async saveFavorites(favorites: FavoriteItem[]): Promise<void> {
    try {
      localStorage.setItem('copilot_favorites', JSON.stringify(favorites));
    } catch (error) {
      console.error('Failed to save favorites:', error);
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
  favorites: FavoriteItem[];
  isProcessing: boolean;
  streamingMessage: { chatId: string; content: string } | null;

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

  loadSystemPromptPresets: () => Promise<void>;
  setSystemPromptPresets: (presets: SystemPromptPreset[]) => void;

  addFavorite: (favorite: Omit<FavoriteItem, 'id' | 'createdAt'>) => string;
  removeFavorite: (favoriteId: string) => void;
  updateFavorite: (favoriteId: string, updates: Partial<Omit<FavoriteItem, 'id' | 'createdAt'>>) => void;
  loadFavorites: () => Promise<void>;
  saveFavorites: () => Promise<void>;

  initiateAIResponse: (chatId: string, userMessage: string) => Promise<void>;
  triggerAIResponseOnly: (chatId: string) => Promise<void>;
  handleAIToolCall: (chatId: string, aiResponse: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  // Initial state
  chats: [],
  currentChatId: null,
  latestActiveChatId: null,
  messages: {},
  systemPromptPresets: [],
  favorites: [],
  isProcessing: false,
  streamingMessage: null, // 当前正在流式传输的消息

  // Chat management actions
  addChat: (chatData) => {
    const newChat: ChatItem = {
      ...chatData,
      id: Date.now().toString(),
      createdAt: chatData.createdAt || Date.now(),
      pinned: false,
      toolCategory: chatData.toolCategory || "general_assistant", // 默认工具类别 - 将在后续版本中改为动态获取
      systemPromptId: chatData.systemPromptId || "general_assistant", // 默认系统提示词ID - 将在后续版本中改为动态获取
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

    // 防抖保存 - 避免频繁保存导致性能问题
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

    // 暂时移除自动保存，避免在流式响应中频繁保存导致状态更新循环
    // 保存将在流式响应完成时进行
  },

  deleteMessage: (chatId, messageId) => {
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
          [chatId]: currentMessages.filter(msg => msg.id !== messageId)
        }
      };
    });

    // Auto-save messages to storage
    get().saveChats();
  },

  // Data persistence
  loadChats: async () => {
    try {
      // Load optimized chats (without messages)
      const optimizedChats = await storageService.loadChats();
      const latestActiveChatId = await storageService.loadLatestActiveChatId();

      // Convert optimized chats back to regular ChatItem format for compatibility
      const chats: ChatItem[] = optimizedChats.map(chat => ({
        ...chat,
        messages: [], // Messages will be loaded on-demand
      }));

      // For now, load all messages to maintain compatibility
      // TODO: Implement lazy loading in the future
      const messages: Record<string, Message[]> = {};
      for (const chat of optimizedChats) {
        messages[chat.id] = await storageService.loadMessages(chat.id);
      }

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

      // Convert chats to optimized format
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

      // Save chats and messages separately
      await storageService.saveChats(optimizedChats);

      // Save messages for each chat
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

  // Favorites management
  addFavorite: (favorite) => {
    const id = crypto.randomUUID();
    const newFavorite: FavoriteItem = {
      ...favorite,
      id,
      createdAt: Date.now(),
    };

    set(state => ({
      favorites: [...state.favorites, newFavorite]
    }));

    // Auto-save favorites
    get().saveFavorites();
    return id;
  },

  removeFavorite: (favoriteId) => {
    set(state => ({
      favorites: state.favorites.filter(fav => fav.id !== favoriteId)
    }));

    // Auto-save favorites
    get().saveFavorites();
  },

  updateFavorite: (favoriteId, updates) => {
    set(state => ({
      favorites: state.favorites.map(fav =>
        fav.id === favoriteId ? { ...fav, ...updates } : fav
      )
    }));

    // Auto-save favorites
    get().saveFavorites();
  },

  loadFavorites: async () => {
    try {
      const favorites = await favoritesStorageService.loadFavorites();
      set({ favorites });
    } catch (error) {
      console.error('Failed to load favorites:', error);
      set({ favorites: [] });
    }
  },

  saveFavorites: async () => {
    try {
      const { favorites } = get();
      await favoritesStorageService.saveFavorites(favorites);
    } catch (error) {
      console.error('Failed to save favorites:', error);
    }
  },

  // AI interaction - 调用真正的 AI 服务
  initiateAIResponse: async (chatId, userMessage) => {
    const { addMessage } = get();

    // Add user message
    const userMsg: Message = {
      id: Date.now().toString(),
      content: createTextContent(userMessage),
      role: 'user',
    };
    addMessage(chatId, userMsg);

    set({ isProcessing: true });

    try {
      // 获取当前聊天的所有消息（不包括刚添加的用户消息，我们会手动添加）
      const currentState = get();
      const existingMessages = currentState.messages[chatId] || [];
      const currentChat = currentState.chats.find(chat => chat.id === chatId);

      // 手动构建包含新用户消息的消息列表
      const chatMessages = [...existingMessages, userMsg];

      console.log('[chatStore] Messages to send:', chatMessages.length, 'messages');
      console.log('[chatStore] Last message:', chatMessages[chatMessages.length - 1]);

      // 构建发送给 AI 的消息列表，包含系统提示
      const messagesToSend: Message[] = [];

      // 添加系统消息（如果存在）
      if (currentChat?.systemPrompt) {
        // 动态增强系统提示词（如果category不是strict mode）
        let systemPromptContent = currentChat.systemPrompt;

        try {
          if (currentChat.systemPromptId) {
            const enhancer = SystemPromptEnhancer.getInstance();
            const isStrictMode = await enhancer.isStrictMode(currentChat.systemPromptId);

            if (!isStrictMode) {
              // Non-strict mode: 使用增强的system prompt
              systemPromptContent = await enhancer.buildEnhancedSystemPrompt(currentChat.systemPromptId);
              console.log('[chatStore] Using enhanced system prompt for non-strict mode category:', currentChat.systemPromptId);
            } else {
              console.log('[chatStore] Using original system prompt for strict mode category:', currentChat.systemPromptId);
            }
          }
        } catch (error) {
          console.error('[chatStore] Failed to enhance system prompt, using original:', error);
          // 如果增强失败，继续使用原始的system prompt
        }

        messagesToSend.push({
          role: 'system',
          content: systemPromptContent,
          id: 'system',
        });
      }

      // 添加所有聊天消息
      messagesToSend.push(...chatMessages);

      // 使用 ServiceFactory 调用 AI 服务
      let assistantResponse = '';

      // Generate unique turn ID to avoid updating previous messages
      const turnId = Date.now();
      let lastUpdateTime = 0;
      const UPDATE_THROTTLE_MS = 150; // 限制更新频率为150ms，提升UI流畅度

      // 处理流式响应的回调函数
      const handleStreamChunk = async (rawMessage: string) => {
        // 处理 [DONE] 信号
        if (rawMessage.trim() === '[DONE]') {

          // 确保最后的内容显示在流式消息中
          if (assistantResponse) {
            set({ streamingMessage: { chatId, content: assistantResponse } });

            // 短暂延迟后转换为正式消息，确保用户看到完整内容
            setTimeout(() => {
              const assistantMsg: Message = {
                id: `assistant-${turnId}`,
                content: assistantResponse,
                role: 'assistant',
              };
              addMessage(chatId, assistantMsg);

              // 清除流式消息状态
              set({ streamingMessage: null });
            }, 100);
          } else {
            // 没有内容时直接清除
            set({ streamingMessage: null });
          }

          // 流式响应完成，保存聊天数据
          get().saveChats();

          // 检查AI响应是否包含工具调用（仅在非严格模式下）
          try {
            console.log('[chatStore] Stream completed, checking for tool calls...');
            console.log('[chatStore] Current chat systemPromptId:', currentChat?.systemPromptId);
            console.log('[chatStore] Assistant response length:', assistantResponse.length);
            console.log('[chatStore] Assistant response preview:', assistantResponse.substring(0, 200));

            if (currentChat?.systemPromptId && assistantResponse.trim()) {
              const enhancer = SystemPromptEnhancer.getInstance();
              const isStrictMode = await enhancer.isStrictMode(currentChat.systemPromptId);

              console.log('[chatStore] Category strict mode:', isStrictMode);

              if (!isStrictMode) {
                console.log('[chatStore] Non-strict mode detected, checking for AI tool calls...');
                await get().handleAIToolCall(chatId, assistantResponse);
              } else {
                console.log('[chatStore] Strict mode detected, skipping AI tool call check');
              }
            } else {
              console.log('[chatStore] Skipping tool call check - missing systemPromptId or empty response');
            }
          } catch (error) {
            console.error('[chatStore] Failed to handle AI tool call:', error);
          }

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
                  // 使用节流来减少UI更新频率
                  const now = Date.now();
                  const timeSinceLastUpdate = now - lastUpdateTime;

                  if (timeSinceLastUpdate > UPDATE_THROTTLE_MS) {
                    lastUpdateTime = now;
                    set({ streamingMessage: { chatId, content: assistantResponse } });
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
      await serviceFactory.executePrompt(
        messagesToSend,
        currentChat?.model || undefined,
        handleStreamChunk
      );

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
      let chatMessages = messages[chatId] || [];
      const currentChat = chats.find(chat => chat.id === chatId);

      console.log('[triggerAIResponseOnly] Chat ID:', chatId);
      console.log('[triggerAIResponseOnly] Original messages count:', chatMessages.length);
      console.log('[triggerAIResponseOnly] Original messages:', chatMessages.map((msg, index) => ({
        index,
        role: msg.role,
        id: msg.id,
        contentPreview: getMessageText(msg.content).substring(0, 50)
      })));

      // 检查最后一条消息是否是assistant的回复，如果是则删除它
      // 如果最后一条消息是用户消息，则保持不变（用户可能删除了AI回复想重新生成）
      if (chatMessages.length > 0 && chatMessages[chatMessages.length - 1].role === 'assistant') {
        console.log('[triggerAIResponseOnly] Removing last assistant message before regeneration');
        console.log('[triggerAIResponseOnly] Last message to remove:', {
          role: chatMessages[chatMessages.length - 1].role,
          id: chatMessages[chatMessages.length - 1].id,
          contentPreview: getMessageText(chatMessages[chatMessages.length - 1].content).substring(0, 50)
        });
        chatMessages = chatMessages.slice(0, -1);
        console.log('[triggerAIResponseOnly] Messages after removal count:', chatMessages.length);
      } else {
        console.log('[triggerAIResponseOnly] No assistant message to remove. Last message role:',
          chatMessages.length > 0 ? chatMessages[chatMessages.length - 1].role : 'no messages');
      }

      // 构建发送给 AI 的消息列表，包含系统提示
      const messagesToSend: Message[] = [];

      // 添加系统消息（如果存在）
      if (currentChat?.systemPrompt) {
        // 动态增强系统提示词（如果category不是strict mode）
        let systemPromptContent = currentChat.systemPrompt;

        try {
          if (currentChat.systemPromptId) {
            const enhancer = SystemPromptEnhancer.getInstance();
            const isStrictMode = await enhancer.isStrictMode(currentChat.systemPromptId);

            if (!isStrictMode) {
              // Non-strict mode: 使用增强的system prompt
              systemPromptContent = await enhancer.buildEnhancedSystemPrompt(currentChat.systemPromptId);
              console.log('[chatStore] Using enhanced system prompt for non-strict mode category:', currentChat.systemPromptId);
            } else {
              console.log('[chatStore] Using original system prompt for strict mode category:', currentChat.systemPromptId);
            }
          }
        } catch (error) {
          console.error('[chatStore] Failed to enhance system prompt, using original:', error);
          // 如果增强失败，继续使用原始的system prompt
        }

        messagesToSend.push({
          role: 'system',
          content: systemPromptContent,
          id: 'system',
        });
      }

      // 添加处理后的聊天消息（已排除最后的assistant消息）
      messagesToSend.push(...chatMessages);

      // 使用 ServiceFactory 调用 AI 服务
      let assistantResponse = '';

      // Generate unique turn ID to avoid updating previous messages
      const turnId = Date.now();
      let lastUpdateTime = 0;
      const UPDATE_THROTTLE_MS = 150; // 限制更新频率为150ms，提升UI流畅度

      // 处理流式响应的回调函数
      const handleStreamChunk = async (rawMessage: string) => {
        // 处理 [DONE] 信号
        if (rawMessage.trim() === '[DONE]') {

          // 确保最后的内容显示在流式消息中
          if (assistantResponse) {
            set({ streamingMessage: { chatId, content: assistantResponse } });

            // 短暂延迟后转换为正式消息，确保用户看到完整内容
            setTimeout(() => {
              const assistantMsg: Message = {
                id: `assistant-${turnId}`,
                content: assistantResponse,
                role: 'assistant',
              };
              addMessage(chatId, assistantMsg);

              // 清除流式消息状态
              set({ streamingMessage: null });
            }, 100);
          } else {
            // 没有内容时直接清除
            set({ streamingMessage: null });
          }

          // 流式响应完成，保存聊天数据
          get().saveChats();

          // 检查AI响应是否包含工具调用（仅在非严格模式下）
          try {
            console.log('[chatStore] Stream completed (triggerAIResponseOnly), checking for tool calls...');
            console.log('[chatStore] Current chat systemPromptId:', currentChat?.systemPromptId);
            console.log('[chatStore] Assistant response length:', assistantResponse.length);
            console.log('[chatStore] Assistant response preview:', assistantResponse.substring(0, 200));

            if (currentChat?.systemPromptId && assistantResponse.trim()) {
              const enhancer = SystemPromptEnhancer.getInstance();
              const isStrictMode = await enhancer.isStrictMode(currentChat.systemPromptId);

              console.log('[chatStore] Category strict mode:', isStrictMode);

              if (!isStrictMode) {
                console.log('[chatStore] Non-strict mode detected, checking for AI tool calls...');
                await get().handleAIToolCall(chatId, assistantResponse);
              } else {
                console.log('[chatStore] Strict mode detected, skipping AI tool call check');
              }
            } else {
              console.log('[chatStore] Skipping tool call check - missing systemPromptId or empty response');
            }
          } catch (error) {
            console.error('[chatStore] Failed to handle AI tool call:', error);
          }

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

                  // 使用节流来减少UI更新频率
                  const now = Date.now();
                  const timeSinceLastUpdate = now - lastUpdateTime;

                  if (timeSinceLastUpdate > UPDATE_THROTTLE_MS) {
                    lastUpdateTime = now;
                    set({ streamingMessage: { chatId, content: assistantResponse } });
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
      await serviceFactory.executePrompt(
        messagesToSend,
        currentChat?.model || undefined,
        handleStreamChunk
      );

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

  // Handle AI automatic tool calls
  handleAIToolCall: async (chatId: string, aiResponse: string) => {
    try {
      console.log('[chatStore] handleAIToolCall called with response:', aiResponse.substring(0, 300));

      // Try to extract tool call from AI response
      let jsonStr = '';

      // First try to find JSON in code blocks
      const codeBlockMatch = aiResponse.match(/```json\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1];
        console.log('[chatStore] Found JSON in code block:', jsonStr.substring(0, 100));
      } else {
        // Try to find JSON without code blocks - look for complete JSON objects
        const jsonMatch = aiResponse.match(/\{[\s\S]*?"tool_call"[\s\S]*?\}/);
        if (jsonMatch) {
          jsonStr = jsonMatch[0];
          console.log('[chatStore] Found JSON without code block:', jsonStr.substring(0, 100));
        } else {
          console.log('[chatStore] No tool call JSON found in response');
          return; // No tool call found
        }
      }

      if (!jsonStr.trim()) {
        console.log('[chatStore] Empty JSON string');
        return;
      }

      let toolCallData;
      try {
        toolCallData = JSON.parse(jsonStr);
        console.log('[chatStore] Successfully parsed JSON:', toolCallData);
      } catch (parseError) {
        console.error('[chatStore] JSON parse error:', parseError);
        console.error('[chatStore] Failed to parse JSON string:', jsonStr);
        return;
      }

      // Validate tool call format
      if (!toolCallData.tool_call || !toolCallData.parameters) {
        console.log('[chatStore] Invalid tool call format in AI response');
        return;
      }

      console.log('[chatStore] AI requested tool call:', toolCallData);

      // Import ToolCallProcessor
      const { ToolCallProcessor } = await import('../services/ToolCallProcessor');
      const processor = ToolCallProcessor.getInstance();

      // Create tool call request
      const toolCall = {
        tool_name: toolCallData.tool_call,
        user_description: `AI requested: ${toolCallData.tool_call} with parameters: ${JSON.stringify(toolCallData.parameters)}`
      };

      // Process the tool call
      const result = await processor.processToolCall(toolCall, undefined, async (messages) => {
        // This is the sendLLMRequest function for AI parameter parsing using ServiceFactory
        return new Promise((resolve, reject) => {
          let response = '';

          const handleChunk = (rawMessage: string) => {
            // Handle [DONE] signal
            if (rawMessage.trim() === '[DONE]') {
              resolve(response);
              return;
            }

            // Skip empty messages
            if (!rawMessage || rawMessage.trim() === '') {
              return;
            }

            // Split multiple JSON objects and process each
            const jsonObjects = rawMessage.split(/(?<=})\s*(?={)/);

            for (const jsonStr of jsonObjects) {
              if (!jsonStr.trim()) continue;

              try {
                const data = JSON.parse(jsonStr);

                // Handle streaming response format
                if (data.choices && data.choices.length > 0) {
                  const choice = data.choices[0];

                  // Check if finished
                  if (choice.finish_reason === 'stop') {
                    resolve(response);
                    return;
                  }

                  // Handle delta content
                  if (choice.delta && typeof choice.delta.content !== 'undefined') {
                    if (choice.delta.content !== null && typeof choice.delta.content === 'string') {
                      response += choice.delta.content;
                    }
                  }
                }
              } catch (error) {
                console.error('Error parsing AI response JSON:', error);
                console.error('JSON string:', jsonStr);
              }
            }
          };

          // Use ServiceFactory to execute prompt
          serviceFactory.executePrompt(messages, undefined, handleChunk)
            .then(() => resolve(response))
            .catch(reject);
        });
      });

      // Add tool execution result as a new assistant message
      const { addMessage } = get();
      addMessage(chatId, {
        role: "assistant",
        content: result.content,
        id: crypto.randomUUID(),
      });

      console.log('[chatStore] AI tool call executed successfully');

    } catch (error) {
      console.error('[chatStore] Failed to handle AI tool call:', error);

      // Add error message
      const { addMessage } = get();
      addMessage(chatId, {
        role: "assistant",
        content: `I tried to use a tool but encountered an error: ${error}`,
        id: crypto.randomUUID(),
      });
    }
  },
}));

// 添加防抖保存功能
let saveChatsTimeout: number | null = null;
const SAVE_DEBOUNCE_MS = 500; // 500ms防抖

// 在store创建后立即添加防抖函数
const store = useChatStore.getState();
store.saveChatsDebounced = () => {
  if (saveChatsTimeout) {
    clearTimeout(saveChatsTimeout);
  }
  saveChatsTimeout = setTimeout(() => {
    store.saveChats();
    saveChatsTimeout = null;
  }, SAVE_DEBOUNCE_MS);
};

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
