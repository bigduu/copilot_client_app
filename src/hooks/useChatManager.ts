import { useState, useCallback, useMemo } from "react";
import { ChatService, FavoritesService, SystemPromptService } from "../services";
import { useChats } from "./useChats";
import { useMessages } from "./useMessages";
import { useModels } from "./useModels";
import { createExportFavorites } from "../contexts/newExportFunction";
import { ChatItem, FavoriteItem, SystemPromptPresetList } from "../types/chat";

/**
 * useChatManager - Main Hook that integrates all chat-related functionality
 * Combines Service layer business logic with React state management
 */
export function useChatManager() {
  // Service layer instances
  const chatService = useMemo(() => ChatService.getInstance(), []);
  const favoritesService = useMemo(() => FavoritesService.getInstance(), []);
  const systemPromptService = useMemo(() => SystemPromptService.getInstance(), []);

  // Integration of existing hooks
  const { selectedModel } = useModels();
  
  // Chat-related state and functionality
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

  // Message-related state and functionality
  const {
    isStreaming,
    setIsStreaming,
    activeChannel,
    sendMessage: originalSendMessage,
    addAssistantMessage,
    initiateAIResponse,
  } = useMessages(currentChatId, updateChatMessages, currentMessages, currentChat);

  // ====== Favorites State Management ======
  const [favorites, setFavorites] = useState<FavoriteItem[]>(() => {
    return favoritesService.loadFavorites();
  });

  // ====== System Prompt Presets State Management ======
  const [systemPromptPresets, setSystemPromptPresets] = useState<SystemPromptPresetList>(() => {
    return systemPromptService.loadSystemPromptPresets();
  });

  const [selectedSystemPromptPresetId, setSelectedSystemPromptPresetId] = useState<string>(() => {
    return systemPromptService.getSelectedSystemPromptPresetId();
  });

  // ====== Chat Operation Methods (Service + React Integration) ======
  
  const addChat = useCallback((firstUserMessageContent?: string): string => {
    // Use Service to create chat data
    const newChat = chatService.createChat(firstUserMessageContent, selectedModel);
    
    // Update title number
    const chatNumber = chats.length + 1;
    if (!firstUserMessageContent) {
      newChat.title = `Chat ${chatNumber}`;
    }
    
    // Update React state
    const updatedChats = [newChat, ...chats];
    setChats(updatedChats);
    chatService.saveChats(updatedChats);
    
    // Select the newly created chat
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
    
    // Check if current chat was deleted
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

  // ====== Favorites Operation Methods ======
  
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

  // Export favorites functionality
  const exportFavorites = useMemo(() => 
    createExportFavorites({
      currentChatId,
      getCurrentChatFavorites,
    }), [currentChatId, getCurrentChatFavorites]
  );

  // Summarize favorites
  const summarizeFavorites = useCallback(async () => {
    if (!currentChatId) return;

    const chatFavorites = getCurrentChatFavorites();
    if (chatFavorites.length === 0) return;

    const summaryContent = favoritesService.generateSummaryContent(chatFavorites);
    
    console.log("Creating new chat for summarization with content:", summaryContent.substring(0, 100) + "...");

    // Create new chat and select it
    const newChatId = addChat(summaryContent);
    selectChat(newChatId);

    // Delay trigger AI response
    setTimeout(() => {
      try {
        initiateAIResponse();
      } catch (error) {
        console.error("Error initiating AI response:", error);
      }
    }, 300);
  }, [currentChatId, getCurrentChatFavorites, favoritesService, addChat, selectChat, initiateAIResponse]);

  // ====== System Prompt Operation Methods ======
  
  const updateSystemPrompt = useCallback((prompt: string) => {
    systemPromptService.updateGlobalSystemPrompt(prompt);
  }, [systemPromptService]);

  const addSystemPromptPreset = useCallback((preset: Omit<any, "id">) => {
    const newPresets = systemPromptService.addSystemPromptPreset(preset, systemPromptPresets);
    setSystemPromptPresets(newPresets);
    systemPromptService.saveSystemPromptPresets(newPresets);
  }, [systemPromptService, systemPromptPresets]);

  const updateSystemPromptPreset = useCallback((
    id: string,
    preset: Omit<any, "id">
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

  // Get current system prompt content
  const systemPrompt = useMemo(() => {
    return systemPromptService.getCurrentSystemPromptContent(
      systemPromptPresets,
      selectedSystemPromptPresetId
    );
  }, [systemPromptService, systemPromptPresets, selectedSystemPromptPresetId]);

  // Navigate to message
  const navigateToMessage = useCallback((messageId?: string) => {
    if (!currentChat || !messageId) return;

    // Send custom event to ChatView for scroll handling
    const event = new CustomEvent("navigate-to-message", {
      detail: { messageId },
    });
    window.dispatchEvent(event);
  }, [currentChat]);

  // Return unified interface
  return {
    // Chat state
    chats,
    currentChatId,
    currentChat,
    currentMessages,
    
    // Streaming state
    isStreaming,
    setIsStreaming,
    activeChannel,
    
    // Chat operations
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
    
    // Message operations
    sendMessage: originalSendMessage,
    addAssistantMessage,
    initiateAIResponse,
    
    // System prompt
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
    
    // Favorites
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
