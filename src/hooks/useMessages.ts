import { useState, useCallback } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import { Message, ChatItem } from "../types/chat";
import { DEFAULT_MESSAGE } from "../constants";
import { isMermaidEnhancementEnabled, getMermaidEnhancementPrompt } from "../utils/mermaidUtils";
import { ToolService } from "../services/ToolService";

// System prompt storage key
const SYSTEM_PROMPT_KEY = "system_prompt";

const getEffectiveSystemPrompt = (chat: ChatItem | null) => {
  let basePrompt = "";

  if (!chat) {
    basePrompt = localStorage.getItem(SYSTEM_PROMPT_KEY) || DEFAULT_MESSAGE;
  } else {
    // First try to use chat's stored systemPrompt
    if (chat.systemPrompt) {
      basePrompt = chat.systemPrompt;
    } else {
      // Look for existing system message
      const systemMessage = chat.messages.find(m => m.role === "system");
      if (systemMessage) {
        basePrompt = systemMessage.content;
      } else {
        // Fall back to current global system prompt
        basePrompt = localStorage.getItem(SYSTEM_PROMPT_KEY) || DEFAULT_MESSAGE;
      }
    }
  }

  // Append Mermaid enhancement if enabled
  return isMermaidEnhancementEnabled() ? basePrompt + getMermaidEnhancementPrompt() : basePrompt;
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
    (message: Message) => { // Renamed assistantMessage to message for consistency with instructions
      if (currentChatId) {
        // Ensure the message has an ID
        const finalMessage = { // Renamed messageWithId to finalMessage for consistency
          ...message,
          id: message.id || crypto.randomUUID(),
        };
        
        const updatedMessages = [...currentMessages, finalMessage];
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

  // Helper function to send direct LLM request
  const sendDirectLLMRequest = useCallback(async (messagesToSend: Message[]) => {
    try {
      console.log("Creating channel for response");
      const channel = new Channel<string>();

      // Store the active channel
      setActiveChannel(channel);

      // Set streaming state
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
        addAssistantMessage({
          role: "assistant",
          content: `Error: ${
            error instanceof Error ? error.message : String(error)
          }`,
          id: crypto.randomUUID(),
        });
      });
    } catch (error) {
      console.error("Failed to invoke execute_prompt:", error);
    }
  }, [currentChat, addAssistantMessage]);

  // Helper function to handle tool calls
  const handleToolCall = useCallback(async (toolCall: any, _messagesToSend: Message[]) => {
    const toolService = ToolService.getInstance();

    try {
      setIsStreaming(true);

      // 1. Check if tool exists
      const toolInfo = await toolService.getToolInfo(toolCall.tool_name);
      if (!toolInfo) {
        const errorMsg = `Tool '${toolCall.tool_name}' not found.`;
        addAssistantMessage({
          role: "assistant",
          content: errorMsg,
          id: crypto.randomUUID(),
        });
        return;
      }

      // 2. Parse parameters using AI
      const parameters = await toolService.parseToolParameters(
        toolCall,
        toolInfo,
        async (messages: Message[]) => {
          // Create a simple LLM request for parameter parsing
          return new Promise<string>((resolve, reject) => {
            const channel = new Channel<string>();
            let response = "";

            channel.onmessage = (message) => {
              try {
                const data = JSON.parse(message);
                if (data.choices?.[0]?.delta?.content) {
                  response += data.choices[0].delta.content;
                }
                if (data.choices?.[0]?.finish_reason === "stop") {
                  resolve(response);
                }
              } catch (e) {
                // Handle non-JSON responses
                if (message.includes("[DONE]")) {
                  resolve(response);
                }
              }
            };

            invoke("execute_prompt", {
              messages,
              channel,
              model: currentChat?.model,
            }).catch(reject);
          });
        }
      );

      // 3. Execute tool
      const result = await toolService.executeTool({
        tool_name: toolCall.tool_name,
        parameters,
      });

      // 4. Format and display result
      const formattedResult = toolService.formatToolResult(
        toolCall.tool_name,
        parameters,
        result
      );

      addAssistantMessage({
        role: "assistant",
        content: formattedResult,
        id: crypto.randomUUID(),
      });

    } catch (error) {
      console.error("Tool call failed:", error);
      addAssistantMessage({
        role: "assistant",
        content: `Tool execution failed: ${error}`,
        id: crypto.randomUUID(),
      });
    }
  }, [currentChat, addAssistantMessage]);

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
        id: crypto.randomUUID(),
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

      // Check if this is a tool call
      const toolService = ToolService.getInstance();
      const toolCall = toolService.parseToolCallFormat(content);

      if (toolCall) {
        // Handle tool call
        await handleToolCall(toolCall, messagesToSend);
      } else {
        // Regular message - send directly to LLM
        await sendDirectLLMRequest(messagesToSend);
      }
    },
    [
      currentChatId,
      isStreaming,
      currentMessages,
      currentChat,
      addAssistantMessage,
      updateChatMessages,
      handleToolCall,
      sendDirectLLMRequest,
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
        addAssistantMessage({
          role: "assistant",
          content: `Error: ${
            error instanceof Error ? error.message : String(error)
          }`,
          id: crypto.randomUUID(),
        });
      });
    } catch (error) {
      console.error("Failed to invoke execute_prompt for AI response:", error);
    }
  }, [
    currentChatId,
    isStreaming,
    currentMessages,
    currentChat,
    addAssistantMessage,
    updateChatMessages, // Added missing dependency based on usage in the function
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
