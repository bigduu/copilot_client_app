import { useChatStore, useCurrentMessages } from '../store/chatStore';
import { Message } from '../types/chat';
import { ToolCallProcessor } from '../services/ToolCallProcessor';

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
  
  // 便捷操作 (针对当前聊天)
  addMessageToCurrentChat: (message: Message) => void;
  updateMessageInCurrentChat: (messageId: string, updates: Partial<Message>) => void;
  sendMessage: (content: string) => Promise<void>;
  generateChatTitle: (chatId: string) => Promise<string>;
  autoUpdateChatTitle: (chatId: string) => Promise<void>;
}

export const useMessages = (): UseMessagesReturn => {
  // 从 Zustand Store 获取数据 (Hook → Store)
  const currentChatId = useChatStore(state => state.currentChatId);
  const messages = useCurrentMessages(); // 使用便捷 hook 获取当前聊天的消息
  const isProcessing = useChatStore(state => state.isProcessing);
  
  // 从 Zustand Store 获取操作方法 (Hook → Store)
  const addMessage = useChatStore(state => state.addMessage);
  const updateMessage = useChatStore(state => state.updateMessage);
  const initiateAIResponse = useChatStore(state => state.initiateAIResponse);

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

  const sendMessage = async (content: string) => {
    if (!currentChatId) {
      console.error('Cannot send message: no active chat');
      return;
    }

    // Check if this is a tool call
    const toolProcessor = ToolCallProcessor.getInstance();
    const isToolCall = toolProcessor.isToolCall(content);

    if (isToolCall) {
      // Handle tool call
      const toolCall = toolProcessor.parseToolCall(content);
      if (toolCall) {
        console.log("[useMessages] Handling tool call:", toolCall);

        // Add user message first
        const userMessage: Message = {
          role: "user",
          content,
          id: crypto.randomUUID(),
        };
        addMessageToCurrentChat(userMessage);

        // Process tool call
        try {
          const result = await toolProcessor.processToolCall(toolCall, undefined, async (messages) => {
            // This is the sendLLMRequest function for AI parameter parsing
            const { invoke } = await import('@tauri-apps/api/core');
            const { Channel } = await import('@tauri-apps/api/core');

            return new Promise((resolve, reject) => {
              const tempChannel = new Channel<string>();
              let response = '';

              tempChannel.onmessage = (rawMessage) => {
                // Handle [DONE] signal
                if (rawMessage.trim() === '[DONE]') {
                  resolve(response);
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
                        resolve(response);
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
                    console.error('Error parsing AI response JSON:', error);
                    console.error('JSON string:', jsonStr);
                  }
                }
              };

              invoke("execute_prompt", {
                messages,
                channel: tempChannel,
                model: null,
              }).catch(reject);
            });
          });

          // Add assistant response
          const assistantMessage: Message = {
            role: "assistant",
            content: result.content,
            id: crypto.randomUUID(),
          };
          addMessageToCurrentChat(assistantMessage);

          // Auto-update chat title after tool call completion
          if (currentChatId) {
            setTimeout(() => autoUpdateChatTitle(currentChatId), 500);
          }

        } catch (error) {
          console.error("Tool call failed:", error);
          const errorMessage: Message = {
            role: "assistant",
            content: `Tool execution failed: ${error}`,
            id: crypto.randomUUID(),
          };
          addMessageToCurrentChat(errorMessage);
        }
        return;
      }
    }

    // Regular message - use store's AI response handling
    await initiateAIResponse(currentChatId, content);

    // Auto-update chat title after AI response (with delay to ensure response is complete)
    setTimeout(() => autoUpdateChatTitle(currentChatId), 2000);
  };

  const generateChatTitle = async (chatId: string): Promise<string> => {
    // Get messages for the specific chat
    const allMessages = useChatStore.getState().messages;
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

      const { invoke } = await import('@tauri-apps/api/core');
      const { Channel } = await import('@tauri-apps/api/core');

      return new Promise((resolve, reject) => {
        const tempChannel = new Channel<string>();
        let response = '';

        tempChannel.onmessage = (rawMessage) => {
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
          }
        ];

        invoke("execute_prompt", {
          messages: titleMessages,
          channel: tempChannel,
          model: null,
        }).catch(reject);
      });

    } catch (error) {
      console.error('Failed to generate chat title:', error);
      // Fallback to first user message
      const firstUserMessage = chatMessages.find(msg => msg.role === 'user');
      if (firstUserMessage) {
        return firstUserMessage.content.substring(0, 30) +
               (firstUserMessage.content.length > 30 ? '...' : '');
      }
      return 'New Chat';
    }
  };

  const autoUpdateChatTitle = async (chatId: string): Promise<void> => {
    try {
      // Get chat info
      const { chats } = useChatStore.getState();
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
      const updateChat = useChatStore.getState().updateChat;
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
    
    // 便捷操作 (针对当前聊天)
    addMessageToCurrentChat,
    updateMessageInCurrentChat,
    sendMessage,
    generateChatTitle,
    autoUpdateChatTitle,
  };
};
