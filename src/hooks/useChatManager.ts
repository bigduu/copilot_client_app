import { useCallback, useMemo } from 'react';
import { useAppStore } from '../store';
import { shallow } from 'zustand/shallow';
import { AppState } from '../store';
import { AIService } from '../services/AIService';
import { Message, MessageImage, createContentWithImages } from '../types/chat';
import { ImageFile } from '../utils/imageUtils';
import { serviceFactory } from '../services/ServiceFactory';
import SystemPromptEnhancer from '../services/SystemPromptEnhancer';

const convertImageFileToMessageImage = (imageFile: ImageFile): MessageImage => {
  return {
    id: imageFile.id,
    base64: imageFile.base64,
    name: imageFile.name,
    size: imageFile.size,
    type: imageFile.type,
    width: undefined,
    height: undefined,
  };
};

export const useChatManager = () => {
  const addMessage = useAppStore((state) => state.addMessage);
  const updateMessage = useAppStore((state) => state.updateMessage);
  const deleteMessage = useAppStore((state) => state.deleteMessage);
  const currentChatId = useAppStore((state) => state.currentChatId);
  const allMessages = useAppStore((state) => state.messages);
  const selectedModel = useAppStore((state) => state.selectedModel);
  const systemPromptPresets = useAppStore(state => state.systemPromptPresets);
  const setCurrentRequestController = useAppStore(state => state.setCurrentRequestController);
  const setProcessing = useAppStore(state => state.setProcessing);
  const setStreamingMessage = useAppStore(state => state.setStreamingMessage);

  const aiService = useMemo(() => new AIService(), []);

  const triggerAIResponse = useCallback(async (chatId: string) => {
    const { chats, messages, selectedModel, systemPromptPresets } = useAppStore.getState();
    const currentChat = chats.find((c: any) => c.id === chatId);
    if (!currentChat) return;

    const chatMessages = messages[chatId] || [];
    if (chatMessages.length === 0) return;

    const modelId = selectedModel || currentChat.model;
    if (!modelId) {
      console.error("No model selected for AI response.");
      addMessage(chatId, {
        id: Date.now().toString(),
        role: 'assistant',
        content: "Error: AI model not selected.",
        createdAt: new Date().toISOString(),
      });
      return;
    }

    const controller = new AbortController();
    setCurrentRequestController(controller);
    setProcessing(true);
    setStreamingMessage({ chatId, content: '' });

    try {
      const systemPrompt = SystemPromptEnhancer.getEnhancedSystemPrompt(currentChat, systemPromptPresets);
      
      let finalContent = '';
      let buffer = '';
      const onChunk = (chunk: string) => {
        if (chunk === '[DONE]') {
          addMessage(chatId, {
            id: Date.now().toString(),
            role: 'assistant',
            content: finalContent,
            createdAt: new Date().toISOString(),
          });
          setProcessing(false);
          setStreamingMessage(null);
          setCurrentRequestController(null);
        } else if (chunk === '[CANCELLED]') {
            setProcessing(false);
            setStreamingMessage(null);
            setCurrentRequestController(null);
        } else {
          buffer += chunk;
          let boundary = buffer.lastIndexOf('}\n{');
          if (boundary === -1) boundary = buffer.lastIndexOf('}{');

          let processable = buffer;
          if (boundary !== -1) {
            processable = buffer.substring(0, boundary + 1);
            buffer = buffer.substring(boundary + 1);
          } else {
            // If no boundary, and buffer ends with '}', we can process it.
            if (!buffer.endsWith('}')) return;
          }
          
          const jsonChunks = processable.replace(/}\s*{/g, '}}\n{').split('\n');

          for (const jsonChunk of jsonChunks) {
            if (jsonChunk.trim() === '') continue;
            try {
              const parsed = JSON.parse(jsonChunk);
              if (parsed.choices && parsed.choices[0].delta.content) {
                finalContent += parsed.choices[0].delta.content;
                setStreamingMessage({ chatId, content: finalContent });
              }
            } catch (e) {
              // console.error("JSON parsing error in chunk:", e);
              // console.error("Problematic chunk:", jsonChunk);
            }
          }
          if (boundary !== -1) {
            // The buffer was split, so what remains is the start of the next JSON
          } else {
            buffer = '';
          }
        }
      };

      await serviceFactory.executePrompt(
        chatMessages,
        modelId,
        onChunk,
        controller.signal
      );
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.log('AI request was cancelled.');
        const streamingMessage = useAppStore.getState().streamingMessage;
        const finalContent = streamingMessage?.content || '';
        if (finalContent) {
          addMessage(chatId, {
            id: Date.now().toString(),
            role: 'assistant',
            content: finalContent + "\n\n-- Request Cancelled --",
            createdAt: new Date().toISOString(),
          });
        }
      } else {
        console.error('Error during AI response:', error);
        addMessage(chatId, {
          id: Date.now().toString(),
          role: 'assistant',
          content: `Error: ${(error as Error).message}`,
          createdAt: new Date().toISOString(),
        });
      }
      setProcessing(false);
      setStreamingMessage(null);
      setCurrentRequestController(null);
    }
  }, [addMessage, setCurrentRequestController, setProcessing, setStreamingMessage]);

  const sendMessage = useCallback(async (content: string, images?: ImageFile[]) => {
    const currentChatId = useAppStore.getState().currentChatId;
    if (!currentChatId) {
      console.error("No active chat selected.");
      return;
    }

    const isToolCall = aiService.isToolCall(content);
    const isApprovalRequest = aiService.isApprovalRequest(content);

    const addUserMessage = (msgContent: any, msgImages?: MessageImage[]) => {
      const userMessage: Message = {
        role: "user",
        content: msgContent,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        images: msgImages,
      };
      addMessage(currentChatId, userMessage);
    };

    if (isApprovalRequest) {
      console.log("[useChatManager] Handling approval request:", content);
      const messageImages = images ? images.map(convertImageFileToMessageImage) : [];
      addUserMessage(content, messageImages);

      const assistantMessageId = crypto.randomUUID();
      const assistantMessage: Message = {
        role: "assistant",
        content: '',
        id: assistantMessageId,
        createdAt: new Date().toISOString(),
      };
      addMessage(currentChatId, assistantMessage);

      try {
        const result = await aiService.processCommand(content);
        updateMessage(currentChatId, assistantMessageId, { content: result.content });
      } catch (error) {
        console.error("Approval request failed:", error);
        updateMessage(currentChatId, assistantMessageId, { content: `Approval processing failed: ${error as string}` });
      }

    } else if (isToolCall) {
      console.log("[useChatManager] Handling tool call:", content);
      const messageImages = images ? images.map(convertImageFileToMessageImage) : [];
      addUserMessage(content, messageImages);

      try {
        const result = await aiService.processCommand(content);
        const assistantMessage: Message = {
          role: "assistant",
          content: result.content,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        };
        addMessage(currentChatId, assistantMessage);
      } catch (error) {
        console.error("Tool call failed:", error);
        const errorMessage: Message = {
          role: "assistant",
          content: `Tool execution failed: ${error as string}`,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        };
        addMessage(currentChatId, errorMessage);
      }

    } else {
      console.log("[useChatManager] Handling regular message");
      const messageImages = images ? images.map(convertImageFileToMessageImage) : [];
      const messageContent = (images && images.length > 0) ? createContentWithImages(content, messageImages) : content;
      addUserMessage(messageContent, messageImages);
      await triggerAIResponse(currentChatId);
    }
  }, [addMessage, updateMessage, aiService, triggerAIResponse]);

  const retryLastMessage = useCallback(async () => {
    const currentChatId = useAppStore.getState().currentChatId;
    if (!currentChatId) return;

    const chatMessages = useAppStore.getState().messages[currentChatId] || [];
    if (chatMessages.length === 0) return;

    const lastMessage = chatMessages[chatMessages.length - 1];

    // If the last message is from the assistant, delete it and trigger a new response.
    if (lastMessage.role === 'assistant') {
      await deleteMessage(currentChatId, lastMessage.id);
      // Ensure the state is updated before triggering AI response
      // by getting the fresh state after deletion.
      await triggerAIResponse(currentChatId);
    } else {
      console.log('Last message is from user, nothing to regenerate.');
    }
  }, [deleteMessage, triggerAIResponse]);

  return { sendMessage, retryLastMessage };
};
