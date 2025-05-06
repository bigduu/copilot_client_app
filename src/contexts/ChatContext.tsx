import React, { createContext, useContext, ReactNode } from "react";
import { Channel } from "@tauri-apps/api/core";
import { Message, ChatItem } from "../types/chat";
import { useChats } from "../hooks/useChats";
import { useMessages } from "../hooks/useMessages";

// System prompt default and storage key
const SYSTEM_PROMPT_KEY = "system_prompt";
const DEFAULT_SYSTEM_PROMPT = `# Hello! I'm your AI Assistant 👋

I'm here to help you with:

* Writing and reviewing code
* Answering questions
* Solving problems
* Explaining concepts
* And much more!

I'll respond using markdown formatting to make information clear and well-structured. Feel free to ask me anything!

---
Let's get started - what can I help you with today?`;

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
  saveChats: () => void;
  addAssistantMessage: (assistantMessage: Message) => void;
  systemPrompt: string;
  updateSystemPrompt: (prompt: string) => void;
  updateCurrentChatSystemPrompt: (prompt: string) => void;
  currentChatSystemPrompt: string | null;
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
  saveChats: () => {},
  addAssistantMessage: () => {},
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  updateSystemPrompt: () => {},
  updateCurrentChatSystemPrompt: () => {},
  currentChatSystemPrompt: null,
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
    updateChatSystemPrompt,
    saveChats,
    deleteAllChats,
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
    saveChats,
    addAssistantMessage,
    systemPrompt:
      localStorage.getItem(SYSTEM_PROMPT_KEY) || DEFAULT_SYSTEM_PROMPT,
    updateSystemPrompt: (prompt: string) => {
      try {
        const promptToSave =
          prompt && prompt.trim() ? prompt : DEFAULT_SYSTEM_PROMPT;
        localStorage.setItem(SYSTEM_PROMPT_KEY, promptToSave);
        console.log("Global system prompt updated successfully");
      } catch (e) {
        console.error("Error saving system prompt:", e);
      }
    },
    updateCurrentChatSystemPrompt: (prompt: string) => {
      if (!currentChatId) {
        console.error("Cannot update system prompt: No current chat");
        return;
      }

      const promptToSave =
        prompt && prompt.trim() ? prompt : DEFAULT_SYSTEM_PROMPT;
      updateChatSystemPrompt(currentChatId, promptToSave);
      console.log("Current chat system prompt updated successfully");
    },
    currentChatSystemPrompt: currentChat?.systemPrompt || null,
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
