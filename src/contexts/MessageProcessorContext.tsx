import React, { createContext, useContext, ReactNode } from "react";
import {
  UseMessageProcessorReturn,
  useMessageProcessor,
} from "../hooks/useMessageProcessor";

// Create context
const MessageProcessorContext = createContext<
  UseMessageProcessorReturn | undefined
>(undefined);

// Provider props interface
interface MessageProcessorProviderProps {
  children: ReactNode;
}

// The provider component
export const MessageProcessorProvider: React.FC<
  MessageProcessorProviderProps
> = ({ children }) => {
  const messageProcessorState = useMessageProcessor();

  return (
    <MessageProcessorContext.Provider value={messageProcessorState}>
      {children}
    </MessageProcessorContext.Provider>
  );
};

// Custom hook to use the context
export const useMessageProcessorContext = () => {
  const context = useContext(MessageProcessorContext);
  if (!context) {
    throw new Error(
      "useMessageProcessorContext must be used within a MessageProcessorProvider"
    );
  }
  return context;
};
