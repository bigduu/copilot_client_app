import React, { createContext, useContext, ReactNode } from "react";
import { Channel } from "@tauri-apps/api/core";
import {
  Message,
  ChatItem,
  SystemPromptPreset,
  SystemPromptPresetList,
  FavoriteItem,
} from "../types/chat";
import { useChats } from "../hooks/useChats";
import { useMessages } from "../hooks/useMessages";
import { useModels } from "../hooks/useModels"; // Import useModels
import { DEFAULT_MESSAGE } from "../constants";

// System prompt default and storage key
const SYSTEM_PROMPT_KEY = "system_prompt";
const SYSTEM_PROMPT_PRESETS_KEY = "system_prompt_presets";
const SYSTEM_PROMPT_SELECTED_ID_KEY = "system_prompt_selected_id";
const FAVORITES_STORAGE_KEY = "chat_favorites";

// Define the context type
interface ChatContextType {
  chats: ChatItem[];
  currentChatId: string | null;
  currentChat: ChatItem | null;
  currentMessages: Message[];
  isStreaming: boolean;
  setIsStreaming: (isStreaming: boolean) => void;
  activeChannel?: Channel<string> | null;
  addChat: (firstUserMessageContent?: string) => string;
  selectChat: (chatId: string | null) => void;
  sendMessage: (content: string) => Promise<void>;
  initiateAIResponse: () => Promise<void>;
  deleteChat: (chatId: string) => void;
  deleteAllChats: () => void;
  deleteEmptyChats: () => void;
  saveChats: () => void;
  addAssistantMessage: (assistantMessage: Message) => void;
  systemPrompt: string;
  updateSystemPrompt: (prompt: string) => void;
  updateCurrentChatSystemPrompt: (prompt: string) => void;
  updateCurrentChatModel: (model: string) => void;
  currentChatSystemPrompt: string | null;
  pinChat: (chatId: string) => void;
  unpinChat: (chatId: string) => void;
  systemPromptPresets: SystemPromptPresetList;
  addSystemPromptPreset: (preset: Omit<SystemPromptPreset, "id">) => void;
  updateSystemPromptPreset: (
    id: string,
    preset: Omit<SystemPromptPreset, "id">
  ) => void;
  deleteSystemPromptPreset: (id: string) => void;
  selectSystemPromptPreset: (id: string) => void;
  selectedSystemPromptPresetId: string | null;
  updateChat: (chatId: string, updates: Partial<ChatItem>) => void;
  // Favorites management
  favorites: FavoriteItem[];
  addFavorite: (favorite: Omit<FavoriteItem, "id" | "createdAt">) => string;
  removeFavorite: (id: string) => void;
  updateFavorite: (
    id: string,
    updates: Partial<Omit<FavoriteItem, "id" | "createdAt">>
  ) => void;
  getCurrentChatFavorites: () => FavoriteItem[];
  exportFavorites: (format: "markdown" | "pdf") => Promise<void>;
  navigateToMessage: (messageId?: string) => void;
  summarizeFavorites: () => Promise<void>;
}

// Create a default context with empty/no-op implementations
const defaultContext: ChatContextType = {
  chats: [],
  currentChatId: null,
  currentChat: null,
  currentMessages: [],
  isStreaming: false,
  setIsStreaming: () => {},
  activeChannel: null,
  addChat: () => "",
  selectChat: () => {},
  sendMessage: async () => {},
  initiateAIResponse: async () => {},
  deleteChat: () => {},
  deleteAllChats: () => {},
  deleteEmptyChats: () => {},
  saveChats: () => {},
  addAssistantMessage: () => {},
  systemPrompt: DEFAULT_MESSAGE,
  updateSystemPrompt: () => {},
  updateCurrentChatSystemPrompt: () => {},
  updateCurrentChatModel: () => {},
  currentChatSystemPrompt: null,
  pinChat: () => {},
  unpinChat: () => {},
  systemPromptPresets: [],
  addSystemPromptPreset: () => {},
  updateSystemPromptPreset: () => {},
  deleteSystemPromptPreset: () => {},
  selectSystemPromptPreset: () => {},
  selectedSystemPromptPresetId: null,
  updateChat: () => {},
  // Initialize favorites
  favorites: [],
  addFavorite: () => "",
  removeFavorite: () => {},
  updateFavorite: () => {},
  getCurrentChatFavorites: () => [],
  exportFavorites: async () => {},
  navigateToMessage: () => {},
  summarizeFavorites: async () => {},
};

// Create the context with the default value
export const ChatContext = createContext<ChatContextType>(defaultContext);

// Provider props interface
interface ChatProviderProps {
  children: ReactNode;
}

// The actual provider implementation
export const ChatProvider: React.FC<ChatProviderProps> = ({ children }) => {
  // Get selected model from useModels hook first
  const { selectedModel } = useModels();

  // Get chat functionality from useChats hook
  const {
    chats,
    currentChatId,
    currentChat,
    currentMessages,
    addChat,
    selectChat,
    deleteChat,
    updateChatMessages,
    saveChats,
    deleteAllChats,
    pinChat,
    unpinChat,
    deleteEmptyChats,
    setChats,
  } = useChats(selectedModel); // Pass selectedModel to useChats

  // Get message functionality from useMessages hook
  const {
    isStreaming,
    setIsStreaming,
    activeChannel,
    sendMessage,
    addAssistantMessage,
    initiateAIResponse,
  } = useMessages(
    currentChatId,
    updateChatMessages,
    currentMessages,
    currentChat
  );

  // ====== Favorites management ======
  const [favorites, setFavorites] = React.useState<FavoriteItem[]>(() => {
    try {
      const storedFavorites = localStorage.getItem(FAVORITES_STORAGE_KEY);
      return storedFavorites ? JSON.parse(storedFavorites) : [];
    } catch (error) {
      console.error("Error loading favorites:", error);
      return [];
    }
  });

  // Save favorites to localStorage
  const saveFavorites = (newFavorites: FavoriteItem[]) => {
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(newFavorites));
    } catch (error) {
      console.error("Error saving favorites:", error);
    }
  };

  // Add a new favorite item
  const addFavorite = (favorite: Omit<FavoriteItem, "id" | "createdAt">) => {
    const id = crypto.randomUUID();
    // Generate a messageId if not provided
    const messageId = favorite.messageId || crypto.randomUUID();

    const newFavorite: FavoriteItem = {
      ...favorite,
      id,
      messageId,
      createdAt: Date.now(),
    };
    const newFavorites = [...favorites, newFavorite];
    setFavorites(newFavorites);
    saveFavorites(newFavorites);
    return id;
  };

  // Remove a favorite by ID
  const removeFavorite = (id: string) => {
    const newFavorites = favorites.filter((fav) => fav.id !== id);
    setFavorites(newFavorites);
    saveFavorites(newFavorites);
  };

  // Update an existing favorite
  const updateFavorite = (
    id: string,
    updates: Partial<Omit<FavoriteItem, "id" | "createdAt">>
  ) => {
    const newFavorites = favorites.map((fav) =>
      fav.id === id ? { ...fav, ...updates } : fav
    );
    setFavorites(newFavorites);
    saveFavorites(newFavorites);
  };

  // Get favorites for the current chat
  const getCurrentChatFavorites = () => {
    if (!currentChatId) return [];
    return favorites.filter((fav) => fav.chatId === currentChatId);
  };

  // Export favorites to markdown or PDF
  const exportFavorites = async (format: "markdown" | "pdf") => {
    if (!currentChatId) return;

    const chatFavorites = getCurrentChatFavorites();
    if (chatFavorites.length === 0) return;

    // Build markdown content
    let markdownContent = `# Chat Favorites Export\n\n`;
    markdownContent += `Generated: ${new Date().toLocaleString()}\n\n`;

    chatFavorites.forEach((fav, index) => {
      markdownContent += `## ${fav.role === "user" ? "You" : "Assistant"} (${
        index + 1
      })\n\n`;
      markdownContent += fav.content;
      markdownContent += "\n\n";
      if (fav.note) {
        markdownContent += `> Note: ${fav.note}\n\n`;
      }
      markdownContent += "---\n\n";
    });

    if (format === "markdown") {
      // Save as markdown
      const blob = new Blob([markdownContent], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chat-favorites-${currentChatId.substring(0, 8)}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (format === "pdf") {
      try {
        // Import jspdf dynamically
        const jsPDF = (await import("jspdf")).default;
        const doc = new jsPDF();

        // Add title
        doc.setFontSize(18);
        doc.text("Chat Favorites Export", 20, 20);

        // Add generation date
        doc.setFontSize(10);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 20, 30);

        let yPos = 40;
        const pageHeight = doc.internal.pageSize.height;

        chatFavorites.forEach((fav, index) => {
          // Check if we need a new page
          if (yPos > pageHeight - 40) {
            doc.addPage();
            yPos = 20;
          }

          // Add role header
          doc.setFontSize(14);
          doc.text(
            `${fav.role === "user" ? "You" : "Assistant"} (${index + 1})`,
            20,
            yPos
          );
          yPos += 10;

          // Add content - split content by lines to prevent overflow
          doc.setFontSize(12);
          const contentLines = doc.splitTextToSize(fav.content, 170);

          // Check if we need to add a new page for content
          if (yPos + contentLines.length * 7 > pageHeight - 20) {
            doc.addPage();
            yPos = 20;
          }

          doc.text(contentLines, 20, yPos);
          yPos += contentLines.length * 7 + 10;

          // Add note if exists
          if (fav.note) {
            // Check if we need a new page for note
            if (yPos > pageHeight - 30) {
              doc.addPage();
              yPos = 20;
            }

            doc.setFontSize(10);
            doc.text(`Note: ${fav.note}`, 30, yPos);
            yPos += 10;
          }

          // Add separator
          doc.setDrawColor(200, 200, 200);
          doc.line(20, yPos, 190, yPos);
          yPos += 15;
        });

        // Save the PDF
        doc.save(`chat-favorites-${currentChatId.substring(0, 8)}.pdf`);
      } catch (error) {
        console.error("Error generating PDF:", error);
        // Fallback to markdown if PDF generation fails
        const blob = new Blob([markdownContent], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `chat-favorites-${currentChatId.substring(0, 8)}.md`;
        a.click();
        URL.revokeObjectURL(url);
      }
    }
  };

  // ====== System Prompt Preset 管理 ======
  // 读取本地存储的预设列表
  const getSystemPromptPresets = (): SystemPromptPresetList => {
    try {
      const raw = localStorage.getItem(SYSTEM_PROMPT_PRESETS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    // 如果没有，初始化一个默认
    return [
      {
        id: "default",
        name: "默认助手",
        content: DEFAULT_MESSAGE,
      },
    ];
  };

  // 当前选中的preset id
  const getSelectedSystemPromptPresetId = (): string => {
    return localStorage.getItem(SYSTEM_PROMPT_SELECTED_ID_KEY) || "default";
  };

  const [systemPromptPresets, setSystemPromptPresets] =
    React.useState<SystemPromptPresetList>(getSystemPromptPresets());
  const [selectedSystemPromptPresetId, setSelectedSystemPromptPresetId] =
    React.useState<string>(getSelectedSystemPromptPresetId());

  // 添加预设
  const addSystemPromptPreset = (preset: Omit<SystemPromptPreset, "id">) => {
    const id = crypto.randomUUID();
    const newPreset = { ...preset, id };
    const newList = [...systemPromptPresets, newPreset];
    setSystemPromptPresets(newList);
    localStorage.setItem(SYSTEM_PROMPT_PRESETS_KEY, JSON.stringify(newList));
  };

  // 编辑预设
  const updateSystemPromptPreset = (
    id: string,
    preset: Omit<SystemPromptPreset, "id">
  ) => {
    const newList = systemPromptPresets.map((p) =>
      p.id === id ? { ...preset, id } : p
    );
    setSystemPromptPresets(newList);
    localStorage.setItem(SYSTEM_PROMPT_PRESETS_KEY, JSON.stringify(newList));
  };

  // 删除预设
  const deleteSystemPromptPreset = (id: string) => {
    const newList = systemPromptPresets.filter((p) => p.id !== id);
    setSystemPromptPresets(newList);
    localStorage.setItem(SYSTEM_PROMPT_PRESETS_KEY, JSON.stringify(newList));
    // 如果删除的是当前选中，重置为default
    if (selectedSystemPromptPresetId === id) {
      setSelectedSystemPromptPresetId("default");
      localStorage.setItem(SYSTEM_PROMPT_SELECTED_ID_KEY, "default");
    }
  };

  const selectSystemPromptPreset = (id: string) => {
    setSelectedSystemPromptPresetId(id);
    localStorage.setItem(SYSTEM_PROMPT_SELECTED_ID_KEY, id);
  };

  // 获取当前全局prompt内容
  const getCurrentSystemPrompt = (): string => {
    const selectedPreset = systemPromptPresets.find(
      (p) => p.id === selectedSystemPromptPresetId
    );
    if (selectedPreset) return selectedPreset.content;

    // Fallback to global or default if selected preset not found or content is empty
    return localStorage.getItem(SYSTEM_PROMPT_KEY) || DEFAULT_MESSAGE;
  };

  const updateCurrentChatSystemPrompt = (prompt: string) => {
    if (!currentChatId || !currentChat) return;

    const updatedChat = {
      ...currentChat,
      systemPrompt: prompt,
    };

    const newChats = chats.map((chat) =>
      chat.id === currentChatId ? updatedChat : chat
    );
    setChats(newChats);
    saveChats();
  };

  const updateCurrentChatModel = (model: string) => {
    if (!currentChatId || !currentChat) return;

    const updatedChat = {
      ...currentChat,
      model: model,
    };

    const newChats = chats.map((chat) =>
      chat.id === currentChatId ? updatedChat : chat
    );
    setChats(newChats);
    saveChats();
  };

  const updateChat = (chatId: string, updates: Partial<ChatItem>) => {
    const newChats = chats.map((chat) =>
      chat.id === chatId ? { ...chat, ...updates } : chat
    );
    setChats(newChats);
    saveChats();
  };

  // Summarize favorites by creating a new chat with all favorites content
  const summarizeFavorites = async () => {
    if (!currentChatId) return;

    const chatFavorites = getCurrentChatFavorites();
    if (chatFavorites.length === 0) return;

    // Build content from favorites
    let summaryContent = "Please summarize the following content:\n\n";

    chatFavorites.forEach((fav, index) => {
      // Add content from favorite
      summaryContent += `### ${fav.role === "user" ? "用户" : "助手"} ${
        index + 1
      }:\n\n`;
      summaryContent += fav.content;
      summaryContent += "\n\n";

      // Add note if it exists
      if (fav.note) {
        summaryContent += `> 笔记: ${fav.note}\n\n`;
      }
    });

    // Add specific summary request
    summaryContent +=
      "请根据以上内容提供一个全面的总结，包括主要观点和重要信息。";

    console.log(
      "Creating new chat for summarization with content:",
      summaryContent.substring(0, 100) + "..."
    );

    // Create a new chat with the summary content as the first message
    const newChatId = addChat(summaryContent);

    // Select the new chat
    selectChat(newChatId);

    // Let the UI update before initiating AI response
    setTimeout(() => {
      try {
        // Trigger AI response for the existing user message
        initiateAIResponse();
      } catch (error) {
        console.error("Error initiating AI response:", error);
      }
    }, 300);
  };

  // Create the context value by combining hook values
  const contextValue: ChatContextType = {
    chats,
    currentChatId,
    currentChat,
    currentMessages,
    isStreaming,
    setIsStreaming,
    activeChannel,
    addChat,
    selectChat,
    sendMessage,
    initiateAIResponse,
    deleteChat,
    deleteAllChats,
    deleteEmptyChats,
    saveChats,
    addAssistantMessage,
    systemPrompt: getCurrentSystemPrompt(),
    updateSystemPrompt: (prompt: string) => {
      try {
        const promptToSave = prompt && prompt.trim() ? prompt : DEFAULT_MESSAGE;
        localStorage.setItem(SYSTEM_PROMPT_KEY, promptToSave);
        console.log("Global system prompt updated successfully");
      } catch (e) {
        console.error("Error saving system prompt:", e);
      }
    },
    updateCurrentChatSystemPrompt,
    updateCurrentChatModel,
    currentChatSystemPrompt: currentChat?.systemPrompt || null,
    pinChat,
    unpinChat,
    systemPromptPresets,
    addSystemPromptPreset,
    updateSystemPromptPreset,
    deleteSystemPromptPreset,
    selectSystemPromptPreset,
    selectedSystemPromptPresetId,
    updateChat,
    // Add favorites functionality to the context
    favorites,
    addFavorite,
    removeFavorite,
    updateFavorite,
    getCurrentChatFavorites,
    exportFavorites,
    summarizeFavorites,
    navigateToMessage: (messageId?: string) => {
      // Find the message in the current chat
      if (!currentChat || !messageId) return;

      // Dispatch custom event for the chat view to handle scrolling
      const event = new CustomEvent("navigate-to-message", {
        detail: { messageId },
      });
      window.dispatchEvent(event);
    },
  };

  // Log context value for debugging
  console.log("Providing chat context with:", {
    chatCount: chats.length,
    hasSystemPrompt: !!contextValue.systemPrompt,
    hasUpdateSystemPrompt: !!contextValue.updateSystemPrompt,
    favoriteCount: favorites.length,
  });

  return (
    <ChatContext.Provider value={contextValue}>{children}</ChatContext.Provider>
  );
};

// Custom hook to use the chat context
export const useChat = (): ChatContextType => {
  const context = useContext(ChatContext);

  // Log context access for debugging
  console.log("useChat hook called with context:", {
    systemPromptAvailable: !!context.systemPrompt,
    updateSystemPromptAvailable: !!context.updateSystemPrompt,
    chatCount: context.chats.length,
    favoriteCount: context.favorites.length,
  });

  return context;
};
