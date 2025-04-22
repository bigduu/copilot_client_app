import { useState, useCallback } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import { Message, ChatItem } from "../types/chat";

// System prompt storage key
const SYSTEM_PROMPT_KEY = "system_prompt";
const DEFAULT_SYSTEM_PROMPT = `# Hello! I'm your AI Assistant 👋\n\nI'm here to help you with:\n\n* Writing and reviewing code\n* Answering questions\n* Solving problems\n* Explaining concepts\n* And much more!\n\nI'll respond using markdown formatting to make information clear and well-structured. Feel free to ask me anything!\n\n---\nLet's get started - what can I help you with today?`;

const getEffectiveSystemPrompt = (chat: ChatItem | null) => {
  if (!chat) return localStorage.getItem(SYSTEM_PROMPT_KEY) || DEFAULT_SYSTEM_PROMPT;
  
  // First try to use chat's stored systemPrompt
  if (chat.systemPrompt) {
    return chat.systemPrompt;
  }
  
  // Look for existing system message
  const systemMessage = chat.messages.find(m => m.role === "system");
  if (systemMessage) {
    return systemMessage.content;
  }
  
  // Fall back to current global system prompt
  return localStorage.getItem(SYSTEM_PROMPT_KEY) || DEFAULT_SYSTEM_PROMPT;
};

export const useMessages = (
  currentChatId: string | null,
  updateChatMessages: (chatId: string, messages: Message[]) => void,
  currentMessages: Message[],
  currentChat: ChatItem | null = null
) => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeChannel, setActiveChannel] = useState<Channel<string> | null>(null);

  // Add assistant message when streaming is complete
  const addAssistantMessage = useCallback(
    (assistantMessage: Message) => {
      console.log("Adding assistant message to chat:", assistantMessage);

      if (currentChatId) {
        const updatedMessages = [...currentMessages, assistantMessage];
        updateChatMessages(currentChatId, updatedMessages);
        
        // Reset streaming state and clear active channel
        setIsStreaming(false);
        setActiveChannel(null);
      } else {
        console.error("Cannot add assistant message: No current chat");
        setIsStreaming(false);
      }
    },
    [currentChatId, currentMessages, updateChatMessages]
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (isStreaming) {
        console.error("Cannot send message while streaming");
        return;
      }

      if (!content.trim()) {
        console.error("Cannot send empty message");
        return;
      }

      // Create a new chat if needed
      if (!currentChatId) {
        console.error("No current chat ID - cannot send message");
        return;
      }

      const userMessage: Message = {
        role: "user",
        content,
      };

      const messagesToSend = [...currentMessages, userMessage];

      console.log("Updating chat with message:", {
        chatId: currentChatId,
        messageCount: messagesToSend.length,
      });

      // Update state with user message first
      updateChatMessages(currentChatId, messagesToSend);

      // Small delay to ensure state updates
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Create channel and send message to backend
      try {
        console.log("Creating channel for response");
        const channel = new Channel<string>();
        
        // Store the active channel
        setActiveChannel(channel);

        // Set streaming state after user message is added
        setIsStreaming(true);

        // Small delay to ensure streaming state is set before invoking backend
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Get the effective system prompt for this chat
        const systemPromptContent = getEffectiveSystemPrompt(currentChat);
        const systemPromptMessage = {
          role: "system" as const,
          content: systemPromptContent
        };
        console.log("Including system prompt in request, length:", systemPromptContent.length);

        // Prepare messages array with system prompt if available
        const messagesWithSystemPrompt = systemPromptMessage 
          ? [systemPromptMessage, ...messagesToSend] 
          : messagesToSend;

        console.log("Invoking execute_prompt with message count:", messagesWithSystemPrompt.length);
        
        await invoke("execute_prompt", {
          messages: messagesWithSystemPrompt,
          channel: channel,
        }).catch((error) => {
          console.error("Error invoking execute_prompt:", error);
          throw error;
        });
      } catch (error) {
        console.error("Failed to invoke execute_prompt:", error);
        addAssistantMessage({
          role: "assistant",
          content: `Error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    },
    [
      currentChatId,
      isStreaming,
      currentMessages,
      currentChat,
      addAssistantMessage,
      updateChatMessages,
    ]
  );

  return {
    isStreaming,
    setIsStreaming,
    activeChannel,
    sendMessage,
    addAssistantMessage,
  };
};
