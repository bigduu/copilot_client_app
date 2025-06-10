import { useState, useCallback, useEffect, useRef } from "react";
import { message } from "antd";
import { useChat } from "../contexts/ChatContext";
import { ToolService } from "../services/ToolService";

/**
 * useChatInput - Manages chat input related state and logic
 * Unified input management separated from InputContainer and MessageInput
 */
export function useChatInput() {
  const [content, setContent] = useState("");
  const [referenceMap, setReferenceMap] = useState<{
    [chatId: string]: string | null;
  }>({});
  
  const {
    currentChatId,
    sendMessage,
    initiateAIResponse,
    currentChat,
    selectedSystemPromptPresetId
  } = useChat();
  const prevChatIdRef = useRef<string | null>(null);
  const toolService = ToolService.getInstance();

  // Get the reference text for the current chat
  const referenceText = currentChatId ? referenceMap[currentChatId] : null;

  // Clear the reference text for a specific chat
  const clearReferenceText = useCallback((chatId: string) => {
    if (!chatId) return;

    setReferenceMap((prevMap) => {
      const newMap = { ...prevMap };
      newMap[chatId] = null;
      return newMap;
    });
  }, []);

  // Set reference text
  const setReferenceText = useCallback((chatId: string, text: string | null) => {
    setReferenceMap((prev) => ({
      ...prev,
      [chatId]: text,
    }));
  }, []);

  // Listen for reference text events
  useEffect(() => {
    const handleReferenceText = (e: Event) => {
      const customEvent = e as CustomEvent<{ text: string; chatId?: string }>;
      const chatId = customEvent.detail.chatId || currentChatId;
      if (chatId) {
        setReferenceText(chatId, customEvent.detail.text);
      }
    };

    window.addEventListener("reference-text", handleReferenceText);

    return () => {
      window.removeEventListener("reference-text", handleReferenceText);
    };
  }, [currentChatId, setReferenceText]);

  // Clear reference text when switching chats
  useEffect(() => {
    if (prevChatIdRef.current && prevChatIdRef.current !== currentChatId) {
      clearReferenceText(prevChatIdRef.current);
    }
    prevChatIdRef.current = currentChatId;
  }, [currentChatId, clearReferenceText]);

  // Handle message submission
  const handleSubmit = useCallback(async (inputContent: string) => {
    const trimmedContent = inputContent.trim();
    if (!trimmedContent && !referenceText) return;

    let messageToSend = trimmedContent;

    // Add reference text
    if (referenceText) {
      messageToSend = trimmedContent
        ? `${referenceText}\n\n${trimmedContent}`
        : referenceText;
    }

    // 获取当前聊天的系统提示 ID
    const systemPromptId = currentChat?.systemPromptId || selectedSystemPromptPresetId;

    try {
      // 使用 ToolService 处理消息：应用自动前缀和权限验证
      const processResult = await toolService.processMessage(messageToSend, systemPromptId);
      
      // 检查验证结果
      if (!processResult.validation.isValid) {
        // 显示权限错误提示
        message.error(processResult.validation.errorMessage);
        return;
      }

      // 使用处理后的内容发送消息
      await sendMessage(processResult.processedContent);
      
      // Clear input content and reference text
      setContent("");
      if (currentChatId) {
        clearReferenceText(currentChatId);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      throw error;
    }
  }, [
    referenceText,
    sendMessage,
    currentChatId,
    clearReferenceText,
    toolService,
    currentChat?.systemPromptId,
    selectedSystemPromptPresetId
  ]);

  // Handle AI retry
  const handleRetry = useCallback(async () => {
    try {
      await initiateAIResponse();
    } catch (error) {
      console.error("Error initiating AI response:", error);
      throw error;
    }
  }, [initiateAIResponse]);

  // Close reference preview
  const handleCloseReferencePreview = useCallback(() => {
    if (currentChatId) {
      clearReferenceText(currentChatId);
    }
  }, [currentChatId, clearReferenceText]);

  return {
    // State
    content,
    setContent,
    referenceText,
    
    // Methods
    handleSubmit,
    handleRetry,
    handleCloseReferencePreview,
    setReferenceText: (text: string | null) => {
      if (currentChatId) {
        setReferenceText(currentChatId, text);
      }
    },
    clearReferenceText: () => {
      if (currentChatId) {
        clearReferenceText(currentChatId);
      }
    },
  };
}