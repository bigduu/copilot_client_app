import React, { createContext, useContext, ReactNode } from "react";
import { useChatManager } from "../../hooks/Sidebar";

// Define the context type based on useChatManager return type
type ChatContextType = ReturnType<typeof useChatManager>;

// Create the context without default implementation
const ChatContext = createContext<ChatContextType | undefined>(undefined);

// Provider props interface
interface ChatProviderProps {
  children: ReactNode;
}

// The actual provider implementation - now much simpler!
export const ChatProvider: React.FC<ChatProviderProps> = ({ children }) => {
  // Use the centralized chat manager
  const chatManager = useChatManager();

  return (
    <ChatContext.Provider value={chatManager}>{children}</ChatContext.Provider>
  );
};

// Custom hook to use the chat context
export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
};
