import { useState, useCallback, useEffect, useRef } from "react";
import { useChat } from "../contexts/ChatContext";

/**
 * useChatInput - 管理聊天输入相关的状态和逻辑
 * 从InputContainer和MessageInput中分离出来的统一输入管理
 */
export function useChatInput() {
  const [content, setContent] = useState("");
  const [referenceMap, setReferenceMap] = useState<{
    [chatId: string]: string | null;
  }>({});
  
  const { currentChatId, sendMessage, initiateAIResponse } = useChat();
  const prevChatIdRef = useRef<string | null>(null);

  // 获取当前聊天的引用文本
  const referenceText = currentChatId ? referenceMap[currentChatId] : null;

  // 清除指定聊天的引用文本
  const clearReferenceText = useCallback((chatId: string) => {
    if (!chatId) return;

    setReferenceMap((prevMap) => {
      const newMap = { ...prevMap };
      newMap[chatId] = null;
      return newMap;
    });
  }, []);

  // 设置引用文本
  const setReferenceText = useCallback((chatId: string, text: string | null) => {
    setReferenceMap((prev) => ({
      ...prev,
      [chatId]: text,
    }));
  }, []);

  // 监听引用文本事件
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

  // 切换聊天时清除引用文本
  useEffect(() => {
    if (prevChatIdRef.current && prevChatIdRef.current !== currentChatId) {
      clearReferenceText(prevChatIdRef.current);
    }
    prevChatIdRef.current = currentChatId;
  }, [currentChatId, clearReferenceText]);

  // 处理消息提交
  const handleSubmit = useCallback(async (inputContent: string) => {
    const trimmedContent = inputContent.trim();
    if (!trimmedContent && !referenceText) return;

    let messageToSend = trimmedContent;

    // 添加引用文本
    if (referenceText) {
      messageToSend = trimmedContent
        ? `${referenceText}\n\n${trimmedContent}`
        : referenceText;
    }

    try {
      await sendMessage(messageToSend);
      
      // 清除输入内容和引用文本
      setContent("");
      if (currentChatId) {
        clearReferenceText(currentChatId);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      throw error;
    }
  }, [referenceText, sendMessage, currentChatId, clearReferenceText]);

  // 处理AI重试
  const handleRetry = useCallback(async () => {
    try {
      await initiateAIResponse();
    } catch (error) {
      console.error("Error initiating AI response:", error);
      throw error;
    }
  }, [initiateAIResponse]);

  // 关闭引用预览
  const handleCloseReferencePreview = useCallback(() => {
    if (currentChatId) {
      clearReferenceText(currentChatId);
    }
  }, [currentChatId, clearReferenceText]);

  return {
    // 状态
    content,
    setContent,
    referenceText,
    
    // 方法
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