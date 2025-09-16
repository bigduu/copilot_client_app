import React, { createContext, useContext } from "react";
import { useChatController } from "../hooks/useChatController";
import { Actor, AnyActor, AnyStateMachine, Interpreter } from "xstate";

// The type for the context value. We infer it from the hook's return type.
type ChatControllerContextType = ReturnType<typeof useChatController>;

// Create the context with an undefined initial value.
const ChatControllerContext = createContext<
  ChatControllerContextType | undefined
>(undefined);

// The provider component that will wrap our app or part of it.
export const ChatControllerProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const chatController = useChatController();
  return (
    <ChatControllerContext.Provider value={chatController}>
      {children}
    </ChatControllerContext.Provider>
  );
};

// The custom hook to consume the context.
export const useChatControllerContext = () => {
  const context = useContext(ChatControllerContext);
  if (context === undefined) {
    throw new Error(
      "useChatControllerContext must be used within a ChatControllerProvider"
    );
  }
  return context;
};
