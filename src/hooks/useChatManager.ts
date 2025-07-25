import { useState, useCallback, useMemo, useEffect } from "react";
import {
  FavoritesService,
  SystemPromptService,
} from "../services";
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
  const favoritesService = useMemo(() => FavoritesService.getInstance(), []);
  const systemPromptService = useMemo(
    () => SystemPromptService.getInstance(),
    []
  );

  // Integration of existing hooks
  const { selectedModel } = useModels();

  // Chat-related state and functionality
  const {
    chats,
    currentChatId,
    currentChat,
    currentMessages,
    selectChat,
    deleteChat: deleteChatFromHook,
    deleteChats: deleteChatsFromHook,
    pinChat: pinChatFromHook,
    unpinChat: unpinChatFromHook,
    updateChat: updateChatFromHook,
    createNewChat,
    deleteEmptyChats: deleteEmptyChatsFromHook,
    saveChats,
  } = useChats();

  // Message-related state and functionality
  const {
    sendMessage: originalSendMessage,
    isProcessing,
  } = useMessages();

  // ====== Favorites State Management ======
  const [favorites, setFavorites] = useState<FavoriteItem[]>(() => {
    return favoritesService.loadFavorites();
  });

  // ====== System Prompt Presets State Management ======
  const [systemPromptPresets, setSystemPromptPresets] =
    useState<SystemPromptPresetList>([]);

  // Asynchronously load tool templates
  const loadSystemPromptPresets = useCallback(async () => {
    try {
      const presets = await systemPromptService.getSystemPromptPresets();
      setSystemPromptPresets(presets);
    } catch (error) {
      console.error("Failed to load system prompt presets:", error);
      setSystemPromptPresets([]);
    }
  }, [systemPromptService]);

  // Load presets when component initializes
  useEffect(() => {
    loadSystemPromptPresets();
  }, [loadSystemPromptPresets]);

  const [selectedSystemPromptPresetId, setSelectedSystemPromptPresetId] =
    useState<string>(() => {
      return systemPromptService.getSelectedSystemPromptPresetId();
    });

  // ====== Chat Operation Methods (Service + React Integration) ======

  const addChat = useCallback(
    (
      firstUserMessageContent?: string,
      options?: {
        systemPromptId?: string;
        toolCategory?: string;
        systemPrompt?: string;
      }
    ): string => {
      try {
        // Update title number
        const chatNumber = chats.length + 1;
        const title = firstUserMessageContent ?
          (firstUserMessageContent.length > 30 ?
            firstUserMessageContent.substring(0, 30) + "..." :
            firstUserMessageContent) :
          `Chat ${chatNumber}`;

        // Use hook's createNewChat method
        createNewChat(title, {
          systemPromptId: options?.systemPromptId || 'general_assistant',
          toolCategory: options?.toolCategory || 'general_assistant',
          systemPrompt: options?.systemPrompt,
          model: selectedModel,
        });

        // Get the newly created chat ID (it will be the first in the list after creation)
        // Since createNewChat automatically selects the new chat, we can get it from currentChatId
        // But we need to return the ID immediately, so we'll generate it the same way the store does
        const newChatId = Date.now().toString();
        return newChatId;
      } catch (error) {
        console.error("Failed to create chat:", error);
        throw new Error("Failed to create chat, please try again");
      }
    },
    [chats, createNewChat, selectedModel]
  );

  const deleteChat = useCallback(
    (chatId: string) => {
      deleteChatFromHook(chatId);
      // Hook automatically handles selecting next chat and saving
    },
    [deleteChatFromHook]
  );

  const deleteChats = useCallback(
    (chatIds: string[]) => {
      deleteChatsFromHook(chatIds);
      // Hook automatically handles deselecting and saving
    },
    [deleteChatsFromHook]
  );

  const deleteAllChats = useCallback(() => {
    // Delete all chats by passing all chat IDs
    const allChatIds = chats.map(chat => chat.id);
    deleteChatsFromHook(allChatIds);
  }, [chats, deleteChatsFromHook]);

  const deleteEmptyChats = useCallback(() => {
    deleteEmptyChatsFromHook();
    // Hook automatically handles everything
  }, [deleteEmptyChatsFromHook]);

  const pinChat = useCallback(
    (chatId: string) => {
      pinChatFromHook(chatId);
    },
    [pinChatFromHook]
  );

  const unpinChat = useCallback(
    (chatId: string) => {
      unpinChatFromHook(chatId);
    },
    [unpinChatFromHook]
  );

  const updateChat = useCallback(
    (chatId: string, updates: Partial<ChatItem>) => {
      updateChatFromHook(chatId, updates);
    },
    [updateChatFromHook]
  );

  const updateCurrentChatSystemPrompt = useCallback(
    (prompt: string) => {
      if (!currentChatId) return;
      updateChatFromHook(currentChatId, { systemPrompt: prompt });
    },
    [currentChatId, updateChatFromHook]
  );

  const updateCurrentChatModel = useCallback(
    (model: string) => {
      if (!currentChatId) return;
      updateChatFromHook(currentChatId, { model });
    },
    [currentChatId, updateChatFromHook]
  );

  // ====== Favorites Operation Methods ======

  const addFavorite = useCallback(
    (favorite: Omit<FavoriteItem, "id" | "createdAt">): string => {
      const result = favoritesService.addFavorite(favorite, favorites);
      setFavorites(result.newFavorites);
      favoritesService.saveFavorites(result.newFavorites);
      return result.newFavoriteId;
    },
    [favoritesService, favorites]
  );

  const removeFavorite = useCallback(
    (id: string) => {
      const newFavorites = favoritesService.removeFavorite(id, favorites);
      setFavorites(newFavorites);
      favoritesService.saveFavorites(newFavorites);
    },
    [favoritesService, favorites]
  );

  const updateFavorite = useCallback(
    (id: string, updates: Partial<Omit<FavoriteItem, "id" | "createdAt">>) => {
      const newFavorites = favoritesService.updateFavorite(
        id,
        updates,
        favorites
      );
      setFavorites(newFavorites);
      favoritesService.saveFavorites(newFavorites);
    },
    [favoritesService, favorites]
  );

  const getCurrentChatFavorites = useCallback(() => {
    if (!currentChatId) return [];
    return favoritesService.getChatFavorites(currentChatId, favorites);
  }, [favoritesService, currentChatId, favorites]);

  // Export favorites functionality
  const exportFavorites = useMemo(
    () =>
      createExportFavorites({
        currentChatId,
        getCurrentChatFavorites,
      }),
    [currentChatId, getCurrentChatFavorites]
  );

  // Summarize favorites
  const summarizeFavorites = useCallback(async () => {
    if (!currentChatId) return;

    const chatFavorites = getCurrentChatFavorites();
    if (chatFavorites.length === 0) return;

    const summaryContent =
      favoritesService.generateSummaryContent(chatFavorites);

    console.log(
      "Creating new chat for summarization with content:",
      summaryContent.substring(0, 100) + "..."
    );

    // Create new chat and select it
    addChat(summaryContent);
    // The addChat method automatically selects the new chat

    // Note: AI response will need to be triggered manually by the user
    // or through a separate mechanism since we don't have direct access
    // to initiateAIResponse in this context
  }, [
    currentChatId,
    getCurrentChatFavorites,
    favoritesService,
    addChat,
  ]);

  // ====== System Prompt Operation Methods ======

  const updateSystemPrompt = useCallback(
    (prompt: string) => {
      systemPromptService.updateGlobalSystemPrompt(prompt);
    },
    [systemPromptService]
  );

  // Note: Preset management functionality has been removed, now fully managed by backend configuration
  const addSystemPromptPreset = useCallback((_preset: Omit<any, "id">) => {
    console.warn(
      "Preset management has been removed, please manage presets through Rust backend configuration files"
    );
    throw new Error(
      "Preset management has been removed, please manage through backend configuration"
    );
  }, []);

  const updateSystemPromptPreset = useCallback(
    (_id: string, _preset: Omit<any, "id">) => {
      console.warn(
        "Preset management has been removed, please manage presets through Rust backend configuration files"
      );
      throw new Error(
        "Preset management has been removed, please manage through backend configuration"
      );
    },
    []
  );

  const deleteSystemPromptPreset = useCallback((_id: string) => {
    console.warn(
      "Preset management has been removed, please manage presets through Rust backend configuration files"
    );
    throw new Error(
      "Preset management has been removed, please manage through backend configuration"
    );
  }, []);

  const selectSystemPromptPreset = useCallback(
    (id: string) => {
      try {
        const preset = systemPromptService.findPresetById(id);
        if (!preset) {
          throw new Error("Cannot find specified system prompt preset");
        }

        setSelectedSystemPromptPresetId(id);
        systemPromptService.setSelectedSystemPromptPresetId(id);
      } catch (error) {
        console.error("Failed to select system prompt preset:", error);
        throw error;
      }
    },
    [systemPromptService]
  );

  // Get current system prompt content
  const [systemPrompt, setSystemPrompt] = useState<string>("");

  useEffect(() => {
    const loadSystemPrompt = async () => {
      try {
        const content = await systemPromptService.getCurrentSystemPromptContent(
          selectedSystemPromptPresetId
        );
        setSystemPrompt(content);
      } catch (error) {
        console.error("Failed to load system prompt:", error);
        setSystemPrompt(systemPromptService.getGlobalSystemPrompt());
      }
    };

    loadSystemPrompt();
  }, [systemPromptService, selectedSystemPromptPresetId]);

  // Navigate to message
  const navigateToMessage = useCallback(
    (messageId?: string) => {
      if (!currentChat || !messageId) return;

      // Send custom event to ChatView for scroll handling
      const event = new CustomEvent("navigate-to-message", {
        detail: { messageId },
      });
      window.dispatchEvent(event);
    },
    [currentChat]
  );

  // Return unified interface
  return {
    // Chat state
    chats,
    currentChatId,
    currentChat,
    currentMessages,

    // Processing state
    isProcessing,

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
