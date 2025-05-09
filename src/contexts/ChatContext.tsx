import React, { createContext, useContext, ReactNode } from "react";
import { Channel } from "@tauri-apps/api/core";
import {
  Message,
  ChatItem,
  SystemPromptPreset,
  SystemPromptPresetList,
} from "../types/chat";
import { useChats } from "../hooks/useChats";
import { useMessages } from "../hooks/useMessages";
import { DEFAULT_MESSAGE } from "../constants";

// System prompt default and storage key
const SYSTEM_PROMPT_KEY = "system_prompt";
const SYSTEM_PROMPT_PRESETS_KEY = "system_prompt_presets";
const SYSTEM_PROMPT_SELECTED_ID_KEY = "system_prompt_selected_id";

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
};

// Create the context with the default value
export const ChatContext = createContext<ChatContextType>(defaultContext);

// Provider props interface
interface ChatProviderProps {
  children: ReactNode;
}

// The actual provider implementation
export const ChatProvider: React.FC<ChatProviderProps> = ({ children }) => {
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
  } = useChats();

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
  };

  // Log context value for debugging
  console.log("Providing chat context with:", {
    chatCount: chats.length,
    hasSystemPrompt: !!contextValue.systemPrompt,
    hasUpdateSystemPrompt: !!contextValue.updateSystemPrompt,
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
  });

  return context;
};
