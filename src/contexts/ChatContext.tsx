import React, { createContext, useContext, ReactNode } from "react";
import { useChatList } from "../hooks/useChatList";

// Define the context type based on modern hooks
interface ChatContextType {
  // From useChatList
  chats: ReturnType<typeof useChatList>["chats"];
  currentChat: ReturnType<typeof useChatList>["currentChat"];
  currentMessages: ReturnType<typeof useChatList>["currentMessages"];
  pinnedChats: ReturnType<typeof useChatList>["pinnedChats"];
  unpinnedChats: ReturnType<typeof useChatList>["unpinnedChats"];
  chatCount: ReturnType<typeof useChatList>["chatCount"];
  selectChat: ReturnType<typeof useChatList>["selectChat"];
  deleteChat: ReturnType<typeof useChatList>["deleteChat"];
  deleteChats: ReturnType<typeof useChatList>["deleteChats"];
  pinChat: ReturnType<typeof useChatList>["pinChat"];
  unpinChat: ReturnType<typeof useChatList>["unpinChat"];
  updateChat: ReturnType<typeof useChatList>["updateChat"];
  loadChats: ReturnType<typeof useChatList>["loadChats"];
  saveChats: ReturnType<typeof useChatList>["saveChats"];
  createNewChat: ReturnType<typeof useChatList>["createNewChat"];
  createChatWithSystemPrompt: ReturnType<
    typeof useChatList
  >["createChatWithSystemPrompt"];
  toggleChatPin: ReturnType<typeof useChatList>["toggleChatPin"];
  updateChatTitle: ReturnType<typeof useChatList>["updateChatTitle"];
  deleteEmptyChats: ReturnType<typeof useChatList>["deleteEmptyChats"];
  deleteAllUnpinnedChats: ReturnType<
    typeof useChatList
  >["deleteAllUnpinnedChats"];
}

// Create the context without default implementation
const ChatContext = createContext<ChatContextType | undefined>(undefined);

// Provider props interface
interface ChatProviderProps {
  children: ReactNode;
}

// The actual provider implementation using modern hooks
export const ChatProvider: React.FC<ChatProviderProps> = ({ children }) => {
  // Use modern hooks instead of useChatManager
  const chatsHook = useChatList();

  // Combine all hooks into a single context value
  const contextValue: ChatContextType = {
    // From useChatList
    chats: chatsHook.chats,
    currentChat: chatsHook.currentChat,
    currentMessages: chatsHook.currentMessages,
    pinnedChats: chatsHook.pinnedChats,
    unpinnedChats: chatsHook.unpinnedChats,
    chatCount: chatsHook.chatCount,
    selectChat: chatsHook.selectChat,
    deleteChat: chatsHook.deleteChat,
    deleteChats: chatsHook.deleteChats,
    pinChat: chatsHook.pinChat,
    unpinChat: chatsHook.unpinChat,
    updateChat: chatsHook.updateChat,
    loadChats: chatsHook.loadChats,
    saveChats: chatsHook.saveChats,
    createNewChat: chatsHook.createNewChat,
    createChatWithSystemPrompt: chatsHook.createChatWithSystemPrompt,
    toggleChatPin: chatsHook.toggleChatPin,
    updateChatTitle: chatsHook.updateChatTitle,
    deleteEmptyChats: chatsHook.deleteEmptyChats,
    deleteAllUnpinnedChats: chatsHook.deleteAllUnpinnedChats,
  };

  return (
    <ChatContext.Provider value={contextValue}>{children}</ChatContext.Provider>
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
