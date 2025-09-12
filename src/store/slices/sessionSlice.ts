import { StateCreator } from 'zustand';
import type { AppState } from '..';
import { serviceFactory } from '../../services/ServiceFactory';
import { StreamingResponseHandler } from '../../services/StreamingResponseHandler';
import { AIParameterParser } from '../../services/AIParameterParser';
import { createTextContent, Message, MessageContent } from '../../types/chat';
import SystemPromptEnhancer from '../../services/SystemPromptEnhancer';

export interface SessionSlice {
  // State
  isProcessing: boolean;
  streamingMessage: { chatId: string; content: string } | null;
  currentRequestController: AbortController | null;

  // Actions
  initiateAIResponse: (chatId: string, userMessage: string) => Promise<void>;
  triggerAIResponseOnly: (chatId: string) => Promise<void>;
  handleAIToolCall: (chatId: string, aiResponse: string) => Promise<void>;
  cancelCurrentRequest: () => void;
}

export const createSessionSlice: StateCreator<AppState, [], [], SessionSlice> = (set, get) => ({
  // Initial state
  isProcessing: false,
  streamingMessage: null,
  currentRequestController: null,

  // AI Interaction
  initiateAIResponse: async (chatId, userMessage) => {
    const userMessageContent = createTextContent(userMessage);
    get().addMessage(chatId, {
      id: Date.now().toString(),
      role: 'user',
      content: userMessageContent,
      createdAt: new Date().toISOString(),
    });
    await get().triggerAIResponseOnly(chatId);
  },

  triggerAIResponseOnly: async (chatId) => {
    const { messages, selectedModel, systemPromptPresets } = get();
    const currentChat = get().chats.find(c => c.id === chatId);
    if (!currentChat) return;

    const chatMessages = messages[chatId] || [];
    if (chatMessages.length === 0) return;

    const modelId = selectedModel || currentChat.model;
    if (!modelId) {
      console.error("No model selected for AI response.");
      get().addMessage(chatId, {
        id: Date.now().toString(),
        role: 'assistant',
        content: "Error: AI model not selected.",
        createdAt: new Date().toISOString(),
      });
      return;
    }

    const controller = new AbortController();
    set(state => ({
      ...state,
      isProcessing: true,
      streamingMessage: { chatId, content: '' },
      currentRequestController: controller,
    }));

    try {
      const systemPrompt = SystemPromptEnhancer.getEnhancedSystemPrompt(currentChat, systemPromptPresets);
      const streamingHandler = new StreamingResponseHandler(
        (chunk) => {
          set(state => ({
            ...state,
            streamingMessage: state.streamingMessage ? { ...state.streamingMessage, content: state.streamingMessage.content + chunk } : { chatId, content: chunk }
          }));
        },
        () => {
          const finalContent = get().streamingMessage?.content || '';
          get().addMessage(chatId, {
            id: Date.now().toString(),
            role: 'assistant',
            content: finalContent,
            createdAt: new Date().toISOString(),
          });
          set(state => ({ ...state, isProcessing: false, streamingMessage: null, currentRequestController: null }));
          get().saveChats();
        }
      );

      await serviceFactory.getCompletion(
        modelId,
        chatMessages,
        systemPrompt,
        streamingHandler.handleChunk.bind(streamingHandler),
        controller.signal
      );
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.log('AI request was cancelled.');
        const finalContent = get().streamingMessage?.content || '';
        if (finalContent) { // Only add message if there was some content
          get().addMessage(chatId, {
            id: Date.now().toString(),
            role: 'assistant',
            content: finalContent + "\n\n-- Request Cancelled --",
            createdAt: new Date().toISOString(),
          });
        }
      } else {
        console.error('Error during AI response:', error);
        get().addMessage(chatId, {
          id: Date.now().toString(),
          role: 'assistant',
          content: `Error: ${(error as Error).message}`,
          createdAt: new Date().toISOString(),
        });
      }
      set(state => ({ ...state, isProcessing: false, streamingMessage: null, currentRequestController: null }));
      get().saveChats();
    }
  },

  handleAIToolCall: async (chatId, aiResponse) => {
    const parser = new AIParameterParser();
    const toolCall = parser.parse(aiResponse);

    if (toolCall) {
      const toolMessageContent: MessageContent = [
        { type: 'text', text: `Tool call detected: ${toolCall.toolName}` },
        { type: 'tool_code', tool_code: aiResponse }
      ];
      get().addMessage(chatId, {
        id: Date.now().toString(),
        role: 'assistant',
        content: toolMessageContent,
        createdAt: new Date().toISOString(),
      });
    }
  },

  cancelCurrentRequest: () => {
    get().currentRequestController?.abort();
    set(state => ({ ...state, isProcessing: false, streamingMessage: null, currentRequestController: null }));
  },
});