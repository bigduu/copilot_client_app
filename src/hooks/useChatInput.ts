import { useState, useCallback, useEffect, useRef } from "react";
import { message } from "antd";
import { useChats } from "./useChats";
import { useMessages } from "./useMessages";
import { useAppStore } from "../store";
import { ToolService } from "../services/ToolService";
import { ImageFile, cleanupImagePreviews } from "../utils/imageUtils";
import { getMessageText } from "../types/chat";

/**
 * useChatInput - Manages chat input related state and logic
 * Unified input management separated from InputContainer and MessageInput
 */
export function useChatInput() {
  const [content, setContent] = useState("");
  const [referenceMap, setReferenceMap] = useState<{
    [chatId: string]: string | null;
  }>({});
  const [imagesMap, setImagesMap] = useState<{
    [chatId: string]: ImageFile[];
  }>({});
  const [messageApi, contextHolder] = message.useMessage();

  const { currentChatId, currentChat } = useChats();
  const { sendMessage } = useMessages();
  // Get system prompt preset from store (selected preset ID state can be added if needed)
  const selectedSystemPromptPresetId = null; // Temporarily null, as we mainly rely on the chat's systemPromptId
  // initiateAIResponse is now handled via sendMessage
  const prevChatIdRef = useRef<string | null>(null);
  const toolService = ToolService.getInstance();

  // Get the reference text and images for the current chat
  const referenceText = currentChatId ? referenceMap[currentChatId] : null;
  const images = currentChatId ? (imagesMap[currentChatId] || []) : [];

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
  const setReferenceText = useCallback(
    (chatId: string, text: string | null) => {
      setReferenceMap((prev) => ({
        ...prev,
        [chatId]: text,
      }));
    },
    []
  );

  // Clear images for a specific chat
  const clearImages = useCallback((chatId: string) => {
    if (!chatId) return;

    // Clean up image previews before clearing
    const chatImages = imagesMap[chatId];
    if (chatImages && chatImages.length > 0) {
      cleanupImagePreviews(chatImages);
    }

    setImagesMap((prevMap) => {
      const newMap = { ...prevMap };
      newMap[chatId] = [];
      return newMap;
    });
  }, [imagesMap]);

  // Set images for a specific chat
  const setImages = useCallback(
    (chatId: string, newImages: ImageFile[]) => {
      setImagesMap((prev) => ({
        ...prev,
        [chatId]: newImages,
      }));
    },
    []
  );

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

  // Clear reference text and images when switching chats
  useEffect(() => {
    if (prevChatIdRef.current && prevChatIdRef.current !== currentChatId) {
      clearReferenceText(prevChatIdRef.current);
      clearImages(prevChatIdRef.current);
    }
    prevChatIdRef.current = currentChatId;
  }, [currentChatId, clearReferenceText, clearImages]);

  // Handle message submission
  const handleSubmit = useCallback(
    async (inputContent: string, messageImages?: ImageFile[]) => {
      const trimmedContent = inputContent.trim();
      const imagesToSend = messageImages || images;
      if (!trimmedContent && !referenceText && imagesToSend.length === 0) return;

      let messageToSend = trimmedContent;

      // Add reference text
      if (referenceText) {
        messageToSend = trimmedContent
          ? `${referenceText}\n\n${trimmedContent}`
          : referenceText;
      }

      // Get current chat's system prompt ID
      const systemPromptId =
        currentChat?.systemPromptId || selectedSystemPromptPresetId;

      // If there is no system prompt ID, show an error and return
      if (!systemPromptId) {
        messageApi.error("Current chat is missing system prompt configuration. Please recreate the chat or select a system prompt");
        return;
      }

      try {
        // Use ToolService to process message: apply auto prefix and permission validation
        const processResult = await toolService.processMessage(
          messageToSend,
          systemPromptId
        );

        // Check validation result
        if (!processResult.validation.isValid) {
          // Show permission error message
          messageApi.error(processResult.validation.errorMessage);
          return;
        }

        // Send message using processed content with images
        await sendMessage(processResult.processedContent, imagesToSend.length > 0 ? imagesToSend : undefined);

        // Clear input content, reference text, and images
        setContent("");
        if (currentChatId) {
          clearReferenceText(currentChatId);
          clearImages(currentChatId);
        }
      } catch (error) {
        console.error("Error sending message:", error);
        throw error;
      }
    },
    [
      referenceText,
      images,
      sendMessage,
      currentChatId,
      clearReferenceText,
      clearImages,
      toolService,
      currentChat?.systemPromptId,
      selectedSystemPromptPresetId,
    ]
  );

  // Handle AI retry
  const handleRetry = useCallback(async () => {
    if (!currentChatId) {
      console.error("Cannot retry: no active chat");
      return;
    }

    try {
      // Get current chat messages using the store directly
      const store = useAppStore.getState();
      const currentMessages = store.messages[currentChatId] || [];

      console.log("[handleRetry] Current chat ID:", currentChatId);
      console.log("[handleRetry] Total messages:", currentMessages.length);
      console.log("[handleRetry] Messages:", currentMessages.map((msg, index) => ({
        index,
        role: msg.role,
        id: msg.id,
        contentPreview: getMessageText(msg.content).substring(0, 50)
      })));

      // Check if there are any messages to regenerate
      if (currentMessages.length === 0) {
        console.warn("[handleRetry] No messages found to retry");
        messageApi.warning("No messages found to regenerate");
        return;
      }

      // Check if we have at least one user message to generate a response for
      const lastMessage = currentMessages[currentMessages.length - 1];
      console.log("[handleRetry] Last message:", {
        role: lastMessage.role,
        id: lastMessage.id,
        contentPreview: getMessageText(lastMessage.content).substring(0, 50)
      });

      // If the last message is from the assistant, remove it before retrying
      if (lastMessage.role === "assistant") {
        console.log("[handleRetry] Removing last assistant message before retry...");
        store.deleteMessage(currentChatId, lastMessage.id);
      }

      console.log("[handleRetry] Triggering AI response regeneration...");
      await store.triggerAIResponseOnly(currentChatId);

      console.log("[handleRetry] AI response retry initiated successfully");
    } catch (error) {
      console.error("[handleRetry] Error during retry:", error);
      messageApi.error("Failed to regenerate AI response. Please try again.");
      throw error;
    }
  }, [currentChatId, messageApi]);

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
    images,

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
    setImages: (newImages: ImageFile[]) => {
      if (currentChatId) {
        setImages(currentChatId, newImages);
      }
    },
    clearImages: () => {
      if (currentChatId) {
        clearImages(currentChatId);
      }
    },

    // Message context holder for Ant Design messages
    contextHolder,
  };
}
