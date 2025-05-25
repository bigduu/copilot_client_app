import { useState, useCallback } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import useMessageProcessor from "./useMessageProcessor";
import { ChatItem, Message } from "../../types/chat";
import { DEFAULT_MESSAGE } from "../../constants";
import { ToolExecutionResult } from "./useToolExecution";
import { messageProcessor as messageProcessorService } from "../../services/MessageProcessor";

// System prompt storage key
const SYSTEM_PROMPT_KEY = "system_prompt";

interface UseMessagesReturn {
  isStreaming: boolean;
  setIsStreaming: (streaming: boolean) => void;
  activeChannel: Channel<string> | null;
  sendMessage: (content: string) => Promise<void>;
  addAssistantMessage: (message: Message) => void;
  initiateAIResponse: () => Promise<void>;
  // 新增MessageProcessor相关状态和方法
  messageProcessor: ReturnType<typeof useMessageProcessor>;
}

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
): UseMessagesReturn => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeChannel, setActiveChannel] = useState<Channel<string> | null>(null);
  
  // 集成MessageProcessor功能
  const messageProcessor = useMessageProcessor();

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

      if (!currentChatId) {
        console.error("No current chat ID - cannot send message");
        return;
      }

      try {
        console.log("[useMessages] Processing message through MessageProcessor");

        // 🚀 使用MessageProcessor处理消息流程
        const { preprocessedMessages, onResponseComplete } = await messageProcessor.processMessageFlow(
          content,
          currentMessages
        );

        console.log("[useMessages] Message preprocessed, enhanced messages count:", preprocessedMessages.length);

        // 更新聊天状态，添加用户消息
        const userMessage = preprocessedMessages[preprocessedMessages.length - 1]; // 用户消息是最后一个
        updateChatMessages(currentChatId, [...currentMessages, userMessage]);

        // 延迟确保状态更新
        await new Promise((resolve) => setTimeout(resolve, 100));

        // 创建channel进行流式通信
        const channel = new Channel<string>();
        setActiveChannel(channel);
        setIsStreaming(true);

        await new Promise((resolve) => setTimeout(resolve, 100));

        console.log("[useMessages] Sending preprocessed messages to backend");

        // 发送经过MessageProcessor增强的消息到后端
        await invoke("execute_prompt", {
          messages: preprocessedMessages, // 🎯 使用增强后的消息
          channel: channel,
          model: currentChat?.model,
        }).catch((error) => {
          console.error("Error invoking execute_prompt:", error);
          addAssistantMessage({
            role: "assistant",
            content: `Error: ${error instanceof Error ? error.message : String(error)}`,
            id: crypto.randomUUID(),
          });
        });

        // 🔄 在streaming结束后会通过StreamingMessageItem调用onResponseComplete处理工具
        // 我们需要将onResponseComplete存储起来供后续使用
        (window as any).__currentResponseProcessor = onResponseComplete;

      } catch (error) {
        console.error("Failed to process message with MessageProcessor:", error);
        setIsStreaming(false);
      }
    },
    [
      currentChatId,
      isStreaming,
      currentMessages,
      currentChat,
      addAssistantMessage,
      updateChatMessages,
      messageProcessor
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

    let messagesToProcess = [...currentMessages];
    if (lastMessage.role === 'assistant') {
      // Remove the last assistant message
      messagesToProcess = currentMessages.slice(0, -1);
      updateChatMessages(currentChatId, messagesToProcess);
    }

    try {
      console.log("[useMessages] Initiating AI response through MessageProcessor");

      // 🚀 使用MessageProcessor服务预处理消息（不添加新的用户消息）
      const preprocessedMessages = await messageProcessorService.preprocessMessages(messagesToProcess);
      
      console.log("[useMessages] Messages preprocessed for AI response, enhanced count:", preprocessedMessages.length);

      // 创建channel进行流式通信
      const channel = new Channel<string>();
      setActiveChannel(channel);
      setIsStreaming(true);

      await new Promise((resolve) => setTimeout(resolve, 100));

      console.log("[useMessages] Sending preprocessed messages for AI response");

      // 发送经过MessageProcessor增强的消息到后端
      await invoke("execute_prompt", {
        messages: preprocessedMessages, // 🎯 使用增强后的消息
        channel: channel,
        model: currentChat?.model,
      }).catch((error) => {
        console.error("Error invoking execute_prompt for AI response:", error);
        addAssistantMessage({
          role: "assistant",
          content: `Error: ${error instanceof Error ? error.message : String(error)}`,
          id: crypto.randomUUID(),
        });
      });

      // 🔄 创建响应处理器用于处理AI回复中的工具调用
      const onResponseComplete = async (aiResponse: string): Promise<ToolExecutionResult[]> => {
        console.log("[useMessages] Processing AI response for tool calls");
        const toolCalls = messageProcessorService.parseToolCalls(aiResponse);
        
        if (toolCalls.length === 0) return [];

        const { autoExecuted, pendingApproval } = await messageProcessorService.executeTools(toolCalls);
        
        if (pendingApproval.length > 0) {
          console.log(`[useMessages] ${pendingApproval.length} tools require user approval`);
          // 通过事件发送待审批工具，会被useMessageProcessor监听到
          const event = new CustomEvent('tools-pending-approval', {
            detail: { toolCalls: pendingApproval }
          });
          window.dispatchEvent(event);
        }

        return autoExecuted;
      };

      // 存储响应处理器供StreamingMessageItem使用
      (window as any).__currentResponseProcessor = onResponseComplete;

    } catch (error) {
      console.error("Failed to initiate AI response with MessageProcessor:", error);
      setIsStreaming(false);
    }
  }, [
    currentChatId,
    isStreaming,
    currentMessages,
    currentChat,
    addAssistantMessage,
    updateChatMessages,
    messageProcessor
  ]);

  return {
    isStreaming,
    setIsStreaming,
    activeChannel,
    sendMessage,
    addAssistantMessage,
    initiateAIResponse,
    messageProcessor,
  };
};
