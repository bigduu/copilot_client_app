import { useState, useCallback, useMemo } from "react";
import { Channel } from "@tauri-apps/api/core";
import { ChatService, FavoritesService, SystemPromptService } from "../services";
import { useChats } from "./useChats";
import { useMessages } from "./useMessages";
import { useModels } from "./useModels";
import { createExportFavorites } from "../contexts/newExportFunction";
import { ChatItem, FavoriteItem, SystemPromptPresetList, Message, SystemPromptPreset } from "../types/chat";

interface UseChatManagerReturn {
  // 聊天状态
  chats: ChatItem[];
  currentChatId: string | null;
  currentChat: ChatItem | null;
  currentMessages: Message[];
  
  // 流状态
  isStreaming: boolean;
  setIsStreaming: (streaming: boolean) => void;
  activeChannel: Channel<string> | null;
  
  // 聊天操作
  addChat: (firstUserMessageContent?: string) => string;
  selectChat: (chatId: string | null) => void;
  deleteChat: (chatId: string) => void;
  deleteChats: (chatIds: string[]) => void;
  deleteAllChats: () => void;
  deleteEmptyChats: () => void;
  saveChats: () => void;
  pinChat: (chatId: string) => void;
  unpinChat: (chatId: string) => void;
  updateChat: (chatId: string, updates: Partial<ChatItem>) => void;
  
  // 消息操作
  sendMessage: (content: string) => Promise<void>;
  addAssistantMessage: (message: Message) => void;
  initiateAIResponse: () => Promise<void>;
  
  // 系统提示
  systemPrompt: string;
  updateSystemPrompt: (prompt: string) => void;
  updateCurrentChatSystemPrompt: (prompt: string) => void;
  updateCurrentChatModel: (model: string) => void;
  currentChatSystemPrompt: string | null;
  systemPromptPresets: SystemPromptPresetList;
  addSystemPromptPreset: (preset: Omit<SystemPromptPreset, "id">) => void;
  updateSystemPromptPreset: (id: string, preset: Omit<SystemPromptPreset, "id">) => void;
  deleteSystemPromptPreset: (id: string) => void;
  selectSystemPromptPreset: (id: string) => void;
  selectedSystemPromptPresetId: string;
  
  // 收藏夹
  favorites: FavoriteItem[];
  addFavorite: (favorite: Omit<FavoriteItem, "id" | "createdAt">) => string;
  removeFavorite: (id: string) => void;
  updateFavorite: (id: string, updates: Partial<Omit<FavoriteItem, "id" | "createdAt">>) => void;
  getCurrentChatFavorites: () => FavoriteItem[];
  exportFavorites: (format: "markdown" | "pdf") => Promise<void>;
  summarizeFavorites: () => Promise<void>;
  navigateToMessage: (messageId?: string) => void;
}

/**
 * useChatManager - 整合所有聊天相关功能的主 Hook
 * 结合 Service 层的业务逻辑和 React 的状态管理
 */
export function useChatManager(): UseChatManagerReturn {
  // 服务层实例
  const chatService = useMemo(() => ChatService.getInstance(), []);
  const favoritesService = useMemo(() => FavoritesService.getInstance(), []);
  const systemPromptService = useMemo(() => SystemPromptService.getInstance(), []);

  // 原有 hooks 的集成
  const { selectedModel } = useModels();
  
  // 聊天相关状态和功能
  const {
    chats,
    currentChatId,
    currentChat,
    currentMessages,
    selectChat,
    updateChatMessages,
    saveChats,
    setChats,
  } = useChats(selectedModel);

  // 消息相关状态和功能
  const {
    isStreaming,
    setIsStreaming,
    activeChannel,
    sendMessage: originalSendMessage,
    addAssistantMessage,
    initiateAIResponse,
  } = useMessages(currentChatId, updateChatMessages, currentMessages, currentChat);

  // ====== 收藏夹状态管理 ======
  const [favorites, setFavorites] = useState<FavoriteItem[]>(() => {
    return favoritesService.loadFavorites();
  });

  // ====== 系统提示预设状态管理 ======
  const [systemPromptPresets, setSystemPromptPresets] = useState<SystemPromptPresetList>(() => {
    return systemPromptService.loadSystemPromptPresets();
  });

  const [selectedSystemPromptPresetId, setSelectedSystemPromptPresetId] = useState<string>(() => {
    return systemPromptService.getSelectedSystemPromptPresetId();
  });

  // ====== 聊天操作方法（Service + React 集成）======
  
  const addChat = useCallback((firstUserMessageContent?: string): string => {
    // 使用 Service 创建聊天数据
    const newChat = chatService.createChat(firstUserMessageContent, selectedModel);
    
    // 更新标题数字
    const chatNumber = chats.length + 1;
    if (!firstUserMessageContent) {
      newChat.title = `Chat ${chatNumber}`;
    }
    
    // 更新 React 状态
    const updatedChats = [newChat, ...chats];
    setChats(updatedChats);
    chatService.saveChats(updatedChats);
    
    // 选择新创建的聊天
    selectChat(newChat.id);
    
    return newChat.id;
  }, [chatService, selectedModel, chats, setChats, selectChat]);

  const deleteChat = useCallback((chatId: string) => {
    const result = chatService.deleteChat(chatId, chats);
    setChats(result.updatedChats);
    chatService.saveChats(result.updatedChats);

    if (currentChatId === chatId) {
      const nextChatId = chatService.selectNextChat(result.updatedChats);
      selectChat(nextChatId);
    }
  }, [chatService, chats, currentChatId, setChats, selectChat]);

  const deleteChats = useCallback((chatIds: string[]) => {
    const updatedChats = chatService.deleteChats(chatIds, chats);
    setChats(updatedChats);
    chatService.saveChats(updatedChats);
    selectChat(null);
  }, [chatService, chats, setChats, selectChat]);

  const deleteAllChats = useCallback(() => {
    const updatedChats = chatService.deleteAllChats(chats);
    setChats(updatedChats);
    chatService.saveChats(updatedChats);
    selectChat(null);
  }, [chatService, chats, setChats, selectChat]);

  const deleteEmptyChats = useCallback(() => {
    const updatedChats = chatService.deleteEmptyChats(chats);
    setChats(updatedChats);
    chatService.saveChats(updatedChats);
    
    // 检查当前聊天是否被删除
    if (currentChatId && !updatedChats.find(c => c.id === currentChatId)) {
      const nextChatId = chatService.selectNextChat(updatedChats);
      selectChat(nextChatId);
    }
  }, [chatService, chats, currentChatId, setChats, selectChat]);

  const pinChat = useCallback((chatId: string) => {
    const updatedChats = chatService.pinChat(chatId, chats);
    setChats(updatedChats);
    chatService.saveChats(updatedChats);
  }, [chatService, chats, setChats]);

  const unpinChat = useCallback((chatId: string) => {
    const updatedChats = chatService.unpinChat(chatId, chats);
    setChats(updatedChats);
    chatService.saveChats(updatedChats);
  }, [chatService, chats, setChats]);

  const updateChat = useCallback((chatId: string, updates: Partial<ChatItem>) => {
    const updatedChats = chatService.updateChat(chatId, updates, chats);
    setChats(updatedChats);
    chatService.saveChats(updatedChats);
  }, [chatService, chats, setChats]);

  const updateCurrentChatSystemPrompt = useCallback((prompt: string) => {
    if (!currentChatId) return;
    const updatedChats = chatService.updateChatSystemPrompt(currentChatId, prompt, chats);
    setChats(updatedChats);
    chatService.saveChats(updatedChats);
  }, [chatService, currentChatId, chats, setChats]);

  const updateCurrentChatModel = useCallback((model: string) => {
    if (!currentChatId) return;
    const updatedChats = chatService.updateChatModel(currentChatId, model, chats);
    setChats(updatedChats);
    chatService.saveChats(updatedChats);
  }, [chatService, currentChatId, chats, setChats]);

  // ====== 收藏夹操作方法 ======
  
  const addFavorite = useCallback((favorite: Omit<FavoriteItem, "id" | "createdAt">): string => {
    const result = favoritesService.addFavorite(favorite, favorites);
    setFavorites(result.newFavorites);
    favoritesService.saveFavorites(result.newFavorites);
    return result.newFavoriteId;
  }, [favoritesService, favorites]);

  const removeFavorite = useCallback((id: string) => {
    const newFavorites = favoritesService.removeFavorite(id, favorites);
    setFavorites(newFavorites);
    favoritesService.saveFavorites(newFavorites);
  }, [favoritesService, favorites]);

  const updateFavorite = useCallback((
    id: string,
    updates: Partial<Omit<FavoriteItem, "id" | "createdAt">>
  ) => {
    const newFavorites = favoritesService.updateFavorite(id, updates, favorites);
    setFavorites(newFavorites);
    favoritesService.saveFavorites(newFavorites);
  }, [favoritesService, favorites]);

  const getCurrentChatFavorites = useCallback(() => {
    if (!currentChatId) return [];
    return favoritesService.getChatFavorites(currentChatId, favorites);
  }, [favoritesService, currentChatId, favorites]);

  // 导出收藏夹功能
  const exportFavorites = useMemo(() => 
    createExportFavorites({
      currentChatId,
      getCurrentChatFavorites,
    }), [currentChatId, getCurrentChatFavorites]
  );

  // 总结收藏夹
  const summarizeFavorites = useCallback(async () => {
    if (!currentChatId) return;

    const chatFavorites = getCurrentChatFavorites();
    if (chatFavorites.length === 0) return;

    const summaryContent = favoritesService.generateSummaryContent(chatFavorites);
    
    console.log("Creating new chat for summarization with content:", summaryContent.substring(0, 100) + "...");

    // 创建新聊天并选择
    const newChatId = addChat(summaryContent);
    selectChat(newChatId);

    // 延迟触发 AI 回应
    setTimeout(() => {
      try {
        initiateAIResponse();
      } catch (error) {
        console.error("Error initiating AI response:", error);
      }
    }, 300);
  }, [currentChatId, getCurrentChatFavorites, favoritesService, addChat, selectChat, initiateAIResponse]);

  // ====== 系统提示操作方法 ======
  
  const updateSystemPrompt = useCallback((prompt: string) => {
    systemPromptService.updateGlobalSystemPrompt(prompt);
  }, [systemPromptService]);

  const addSystemPromptPreset = useCallback((preset: Omit<SystemPromptPreset, "id">) => {
    const newPresets = systemPromptService.addSystemPromptPreset(preset, systemPromptPresets);
    setSystemPromptPresets(newPresets);
    systemPromptService.saveSystemPromptPresets(newPresets);
  }, [systemPromptService, systemPromptPresets]);

  const updateSystemPromptPreset = useCallback((
    id: string,
    preset: Omit<SystemPromptPreset, "id">
  ) => {
    const newPresets = systemPromptService.updateSystemPromptPreset(id, preset, systemPromptPresets);
    setSystemPromptPresets(newPresets);
    systemPromptService.saveSystemPromptPresets(newPresets);
  }, [systemPromptService, systemPromptPresets]);

  const deleteSystemPromptPreset = useCallback((id: string) => {
    const result = systemPromptService.deleteSystemPromptPreset(
      id, 
      systemPromptPresets, 
      selectedSystemPromptPresetId
    );
    setSystemPromptPresets(result.newPresets);
    setSelectedSystemPromptPresetId(result.newSelectedId);
    systemPromptService.saveSystemPromptPresets(result.newPresets);
    systemPromptService.setSelectedSystemPromptPresetId(result.newSelectedId);
  }, [systemPromptService, systemPromptPresets, selectedSystemPromptPresetId]);

  const selectSystemPromptPreset = useCallback((id: string) => {
    setSelectedSystemPromptPresetId(id);
    systemPromptService.setSelectedSystemPromptPresetId(id);
  }, [systemPromptService]);

  // 获取当前系统提示内容
  const systemPrompt = useMemo(() => {
    return systemPromptService.getCurrentSystemPromptContent(
      systemPromptPresets,
      selectedSystemPromptPresetId
    );
  }, [systemPromptService, systemPromptPresets, selectedSystemPromptPresetId]);

  // 导航到消息
  const navigateToMessage = useCallback((messageId?: string) => {
    if (!currentChat || !messageId) return;

    // 发送自定义事件给 ChatView 处理滚动
    const event = new CustomEvent("navigate-to-message", {
      detail: { messageId },
    });
    window.dispatchEvent(event);
  }, [currentChat]);

  // 返回统一的接口
  return {
    // 聊天状态
    chats,
    currentChatId,
    currentChat,
    currentMessages,
    
    // 流状态
    isStreaming,
    setIsStreaming,
    activeChannel,
    
    // 聊天操作
    addChat,
    selectChat,
    deleteChat,
    deleteChats,
    deleteAllChats,
    deleteEmptyChats,
    saveChats,
    pinChat,
    unpinChat,
    updateChat,
    
    // 消息操作
    sendMessage: originalSendMessage,
    addAssistantMessage,
    initiateAIResponse,
    
    // 系统提示
    systemPrompt,
    updateSystemPrompt,
    updateCurrentChatSystemPrompt,
    updateCurrentChatModel,
    currentChatSystemPrompt: currentChat?.systemPrompt || null,
    systemPromptPresets,
    addSystemPromptPreset,
    updateSystemPromptPreset,
    deleteSystemPromptPreset,
    selectSystemPromptPreset,
    selectedSystemPromptPresetId,
    
    // 收藏夹
    favorites,
    addFavorite,
    removeFavorite,
    updateFavorite,
    getCurrentChatFavorites,
    exportFavorites,
    summarizeFavorites,
    navigateToMessage,
  };
}
