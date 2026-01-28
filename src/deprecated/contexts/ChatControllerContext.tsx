import React, { createContext, useContext } from "react";
import { useChatManager } from "../../pages/ChatPage/hooks/useChatManager";

// The return type of the hook will be the shape of our context
type ChatManagerContextType = ReturnType<typeof useChatManager>;

// Create the context with an undefined initial value
const ChatControllerContext = createContext<ChatManagerContextType | undefined>(
  undefined,
);

// Custom hook to use the chat controller context
export const useChatController = () => {
  const context = useContext(ChatControllerContext);
  if (context === undefined) {
    throw new Error(
      "useChatController must be used within a ChatControllerProvider",
    );
  }
  return context;
};

// The provider component that will wrap our app
export const ChatControllerProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const chatManager = useChatManager();

  return (
    <ChatControllerContext.Provider value={chatManager}>
      {children}
    </ChatControllerContext.Provider>
  );
};
