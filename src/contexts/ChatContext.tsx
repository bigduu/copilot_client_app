import React, { createContext, useContext, ReactNode } from "react";
import { useMessages } from "../hooks/useMessages";
import { useChats } from "../hooks/useChats";
import { useChatInput } from "../hooks/useChatInput";

// Define the context type based on modern hooks
interface ChatContextType {
  // From useMessages
  messages: ReturnType<typeof useMessages>["messages"];
  isProcessing: ReturnType<typeof useMessages>["isProcessing"];
  currentChatId: ReturnType<typeof useMessages>["currentChatId"];
  addMessage: ReturnType<typeof useMessages>["addMessage"];
  updateMessage: ReturnType<typeof useMessages>["updateMessage"];
  addMessageToCurrentChat: ReturnType<
    typeof useMessages
  >["addMessageToCurrentChat"];
  updateMessageInCurrentChat: ReturnType<
    typeof useMessages
  >["updateMessageInCurrentChat"];
  sendMessage: ReturnType<typeof useMessages>["sendMessage"];
  generateChatTitle: ReturnType<typeof useMessages>["generateChatTitle"];
  autoUpdateChatTitle: ReturnType<typeof useMessages>["autoUpdateChatTitle"];

  // From useChats
  chats: ReturnType<typeof useChats>["chats"];
  currentChat: ReturnType<typeof useChats>["currentChat"];
  currentMessages: ReturnType<typeof useChats>["currentMessages"];
  pinnedChats: ReturnType<typeof useChats>["pinnedChats"];
  unpinnedChats: ReturnType<typeof useChats>["unpinnedChats"];
  chatCount: ReturnType<typeof useChats>["chatCount"];
  selectChat: ReturnType<typeof useChats>["selectChat"];
  deleteChat: ReturnType<typeof useChats>["deleteChat"];
  deleteChats: ReturnType<typeof useChats>["deleteChats"];
  pinChat: ReturnType<typeof useChats>["pinChat"];
  unpinChat: ReturnType<typeof useChats>["unpinChat"];
  updateChat: ReturnType<typeof useChats>["updateChat"];
  loadChats: ReturnType<typeof useChats>["loadChats"];
  saveChats: ReturnType<typeof useChats>["saveChats"];
  createNewChat: ReturnType<typeof useChats>["createNewChat"];
  createChatWithSystemPrompt: ReturnType<
    typeof useChats
  >["createChatWithSystemPrompt"];
  toggleChatPin: ReturnType<typeof useChats>["toggleChatPin"];
  updateChatTitle: ReturnType<typeof useChats>["updateChatTitle"];
  deleteEmptyChats: ReturnType<typeof useChats>["deleteEmptyChats"];
  deleteAllUnpinnedChats: ReturnType<typeof useChats>["deleteAllUnpinnedChats"];

  // From useChatInput
  content: ReturnType<typeof useChatInput>["content"];
  setContent: ReturnType<typeof useChatInput>["setContent"];
  referenceText: ReturnType<typeof useChatInput>["referenceText"];
  images: ReturnType<typeof useChatInput>["images"];
  handleSubmit: ReturnType<typeof useChatInput>["handleSubmit"];
  handleRetry: ReturnType<typeof useChatInput>["handleRetry"];
  handleCloseReferencePreview: ReturnType<
    typeof useChatInput
  >["handleCloseReferencePreview"];
  setReferenceText: ReturnType<typeof useChatInput>["setReferenceText"];
  clearReferenceText: ReturnType<typeof useChatInput>["clearReferenceText"];
  setImages: ReturnType<typeof useChatInput>["setImages"];
  clearImages: ReturnType<typeof useChatInput>["clearImages"];
  contextHolder: ReturnType<typeof useChatInput>["contextHolder"];
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
  const messagesHook = useMessages();
  const chatsHook = useChats();
  const chatInputHook = useChatInput();

  // Combine all hooks into a single context value
  const contextValue: ChatContextType = {
    // From useMessages
    messages: messagesHook.messages,
    isProcessing: messagesHook.isProcessing,
    currentChatId: messagesHook.currentChatId,
    addMessage: messagesHook.addMessage,
    updateMessage: messagesHook.updateMessage,
    addMessageToCurrentChat: messagesHook.addMessageToCurrentChat,
    updateMessageInCurrentChat: messagesHook.updateMessageInCurrentChat,
    sendMessage: messagesHook.sendMessage,
    generateChatTitle: messagesHook.generateChatTitle,
    autoUpdateChatTitle: messagesHook.autoUpdateChatTitle,

    // From useChats
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

    // From useChatInput
    content: chatInputHook.content,
    setContent: chatInputHook.setContent,
    referenceText: chatInputHook.referenceText,
    images: chatInputHook.images,
    handleSubmit: chatInputHook.handleSubmit,
    handleRetry: chatInputHook.handleRetry,
    handleCloseReferencePreview: chatInputHook.handleCloseReferencePreview,
    setReferenceText: chatInputHook.setReferenceText,
    clearReferenceText: chatInputHook.clearReferenceText,
    setImages: chatInputHook.setImages,
    clearImages: chatInputHook.clearImages,
    contextHolder: chatInputHook.contextHolder,
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
