import { useState, useCallback } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import { Message, ChatItem } from "../types/chat";
import { DEFAULT_MESSAGE } from "../constants";

// System prompt storage key
const SYSTEM_PROMPT_KEY = "system_prompt";

const getEffectiveSystemPrompt = (chat: ChatItem | null) => {
  if (!chat) return localStorage.getItem(SYSTEM_PROMPT_KEY) || DEFAULT_MESSAGE;
  
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
  return localStorage.getItem(SYSTEM_PROMPT_KEY) || DEFAULT_MESSAGE;
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
          model: currentChat?.model,
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

  const initiateAIResponse = useCallback(async () => {
    if (isStreaming) {
      console.error("Cannot initiate AI response while already streaming");
      return;
    }
    if (!currentChatId || !currentChat || currentMessages.length === 0) {
      console.error("Cannot initiate AI response: No current chat, or chat is empty.");
      return;
    }

    // Ensure the last message is from the user, otherwise, AI might respond to itself or system.
    const lastMessage = currentMessages[currentMessages.length - 1];
    if (lastMessage.role === 'system') {
        console.warn("Last message is system, AI response not initiated.");
        return;
    }

    if (lastMessage.role === 'assistant') {
      //remove the last message
      const updatedMessages = currentMessages.slice(0, -1);
      updateChatMessages(currentChatId, updatedMessages);
    }

    // Create channel and send message to backend
    try {
      console.log("[useMessages] Initiating AI response. Creating channel.");
      const channel = new Channel<string>();
      setActiveChannel(channel);
      setIsStreaming(true);

      await new Promise((resolve) => setTimeout(resolve, 100)); // Small delay

      const systemPromptContent = getEffectiveSystemPrompt(currentChat);
      const systemPromptMessage = {
        role: "system" as const,
        content: systemPromptContent
      };
      
      const messagesWithSystemPrompt = [systemPromptMessage, ...currentMessages];

      console.log("[useMessages] Invoking execute_prompt for AI response. Message count:", messagesWithSystemPrompt.length);
      await invoke("execute_prompt", {
        messages: messagesWithSystemPrompt,
        channel: channel,
        model: currentChat?.model,
      }).catch((error) => {
        console.error("Error invoking execute_prompt for AI response:", error);
        throw error;
      });
    } catch (error) {
      console.error("Failed to invoke execute_prompt for AI response:", error);
      addAssistantMessage({
        role: "assistant",
        content: `Error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  }, [
    currentChatId,
    isStreaming,
    currentMessages,
    currentChat,
    addAssistantMessage,
  ]);

  return {
    isStreaming,
    setIsStreaming,
    activeChannel,
    sendMessage,
    addAssistantMessage,
    initiateAIResponse,
  };
};
