import { useAppStore } from '../store';
import { useCurrentMessages } from '../store/hooks';
import { Message, getMessageText } from '../types/chat';
import { ImageFile } from '../utils/imageUtils';
import { serviceFactory } from '../services/ServiceFactory';
import { MessageHandler } from '../services/MessageHandler';

/**
 * Hook for managing messages within the current chat
 * Modern architecture following Hook → Store → Service pattern
 *
 * Data flow:
 * Component → useMessages Hook → Zustand Store → Services → External APIs
 */
interface UseMessagesReturn {
  // 数据状态
  messages: Message[];
  isProcessing: boolean;
  currentChatId: string | null;
  
  // 基础操作 (直接映射到 Store)
  addMessage: (chatId: string, message: Message) => void;
  updateMessage: (chatId: string, messageId: string, updates: Partial<Message>) => void;
  deleteMessage: (chatId: string, messageId: string) => void;
  
  // 便捷操作 (针对当前聊天)
  addMessageToCurrentChat: (message: Message) => void;
  updateMessageInCurrentChat: (messageId: string, updates: Partial<Message>) => void;
  sendMessage: (content: string, images?: ImageFile[]) => Promise<void>;
  generateChatTitle: (chatId: string) => Promise<string>;
  autoUpdateChatTitle: (chatId: string) => Promise<void>;
}

export const useMessages = (): UseMessagesReturn => {
  // 从 Zustand Store 获取数据 (Hook → Store)
  const currentChatId = useAppStore(state => state.currentChatId);
  const messages = useCurrentMessages(); // 使用便捷 hook 获取当前聊天的消息
  const isProcessing = useAppStore(state => state.isProcessing);

  // 从 Zustand Store 获取操作方法 (Hook → Store)
  const addMessage = useAppStore(state => state.addMessage);
  const updateMessage = useAppStore(state => state.updateMessage);
  const deleteMessage = useAppStore(state => state.deleteMessage);
  const initiateAIResponse = useAppStore(state => state.initiateAIResponse);
  const triggerAIResponseOnly = useAppStore(state => state.triggerAIResponseOnly);

  // 便捷操作方法 (针对当前聊天)
  const addMessageToCurrentChat = (message: Message) => {
    if (currentChatId) {
      addMessage(currentChatId, message);
    }
  };

  const updateMessageInCurrentChat = (messageId: string, updates: Partial<Message>) => {
    if (currentChatId) {
      updateMessage(currentChatId, messageId, updates);
    }
  };

  const sendMessage = async (content: string, images?: ImageFile[]) => {
    if (!currentChatId) {
      console.error('Cannot send message: no active chat');
      return;
    }

    // Create message handler with required dependencies
    const messageHandler = new MessageHandler(
      currentChatId,
      addMessageToCurrentChat,
      updateMessageInCurrentChat,
      initiateAIResponse,
      triggerAIResponseOnly,
      autoUpdateChatTitle
    );

    // Handle the message using the new MessageHandler
    await messageHandler.handleMessage(content, images);
  };

  const generateChatTitle = async (chatId: string): Promise<string> => {
    // Get messages for the specific chat
    const allMessages = useAppStore.getState().messages;
    const chatMessages = allMessages[chatId] || [];

    // Need at least one user message to generate title
    if (!chatMessages || chatMessages.length === 0) {
      return 'New Chat';
    }

    // Get first few messages for context (max 3 messages)
    const contextMessages = chatMessages.slice(0, 3);
    const conversationContext = contextMessages
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n');

    try {
      // Create AI prompt for title generation
      const titlePrompt = `Based on the following conversation, generate a concise and descriptive title (maximum 4-6 words) that captures the main topic or purpose:

${conversationContext}

Requirements:
- Maximum 6 words
- Descriptive and specific
- No quotes or special characters
- Focus on the main topic/task

Title:`;

      return new Promise((resolve, reject) => {
        let response = '';

        const handleChunk = (rawMessage: string) => {
          // Handle [DONE] signal
          if (rawMessage.trim() === '[DONE]') {
            // Clean up the response and return
            const cleanTitle = response.trim()
              .replace(/^["']|["']$/g, '') // Remove quotes
              .replace(/^Title:\s*/i, '') // Remove "Title:" prefix
              .substring(0, 50); // Max 50 chars
            resolve(cleanTitle || 'New Chat');
            return;
          }

          // Skip empty messages
          if (!rawMessage || rawMessage.trim() === '') {
            return;
          }

          // Split multiple JSON objects and process each
          const jsonObjects = rawMessage.split(/(?<=})\s*(?={)/);

          for (const jsonStr of jsonObjects) {
            if (!jsonStr.trim()) continue;

            try {
              const data = JSON.parse(jsonStr);

              // Handle streaming response format
              if (data.choices && data.choices.length > 0) {
                const choice = data.choices[0];

                // Check if finished
                if (choice.finish_reason === 'stop') {
                  const cleanTitle = response.trim()
                    .replace(/^["']|["']$/g, '') // Remove quotes
                    .replace(/^Title:\s*/i, '') // Remove "Title:" prefix
                    .substring(0, 50); // Max 50 chars
                  resolve(cleanTitle || 'New Chat');
                  return;
                }

                // Handle delta content
                if (choice.delta && typeof choice.delta.content !== 'undefined') {
                  if (choice.delta.content !== null && typeof choice.delta.content === 'string') {
                    response += choice.delta.content;
                  }
                }
              }
            } catch (error) {
              console.error('Error parsing title generation response:', error);
            }
          }
        };

        const titleMessages: Message[] = [
          {
            role: "user",
            content: titlePrompt,
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
          }
        ];

        // Get the latest model state directly from the store
        const chatStoreState = useAppStore.getState();
        const modelToUse = chatStoreState.selectedModel || (chatStoreState.models.length > 0 ? chatStoreState.models[0] : undefined);

        if (!modelToUse) {
          console.error("No model available for title generation.");
          reject(new Error("No model available to generate title."));
          return;
        }

        // Use ServiceFactory to execute prompt with the selected model
        serviceFactory.executePrompt(titleMessages, modelToUse, handleChunk)
          .then(() => {
            // If no response received, resolve with empty string
            const cleanTitle = response.trim()
              .replace(/^["']|["']$/g, '') // Remove quotes
              .replace(/^Title:\s*/i, '') // Remove "Title:" prefix
              .substring(0, 50); // Max 50 chars
            resolve(cleanTitle || 'New Chat');
          })
          .catch(reject);
      });

    } catch (error) {
      console.error('Failed to generate chat title:', error);
      // Fallback to first user message
      const firstUserMessage = chatMessages.find(msg => msg.role === 'user');
      if (firstUserMessage) {
        const textContent = getMessageText(firstUserMessage.content);
        return textContent.substring(0, 30) +
               (textContent.length > 30 ? '...' : '');
      }
      return 'New Chat';
    }
  };

  const autoUpdateChatTitle = async (chatId: string): Promise<void> => {
    try {
      // Get chat info
      const { chats } = useAppStore.getState();
      const chat = chats.find(c => c.id === chatId);

      if (!chat) return;

      // Only auto-update if chat has a generic title
      const isGenericTitle = chat.title.startsWith('New Chat') ||
                            chat.title.startsWith('Chat ') ||
                            chat.title === 'New Chat';

      if (!isGenericTitle) return;

      // Generate new title
      const newTitle = await generateChatTitle(chatId);

      // Update chat title
      const updateChat = useAppStore.getState().updateChat;
      updateChat(chatId, { title: newTitle });

      console.log(`[useMessages] Auto-updated chat title: "${chat.title}" → "${newTitle}"`);

    } catch (error) {
      console.error('Failed to auto-update chat title:', error);
    }
  };

  return {
    // 数据状态
    messages,
    isProcessing,
    currentChatId,
    
    // 基础操作 (直接映射到 Store)
    addMessage,
    updateMessage,
    deleteMessage,
    
    // 便捷操作 (针对当前聊天)
    addMessageToCurrentChat,
    updateMessageInCurrentChat,
    sendMessage,
    generateChatTitle,
    autoUpdateChatTitle,
  };
};
