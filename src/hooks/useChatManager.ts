import { useCallback, useEffect, useMemo, useRef } from 'react';
import { App as AntApp } from 'antd';
import { useAppStore } from '../store';
import { useMachine } from '@xstate/react';
import { chatMachine } from '../core/chatInteractionMachine';
import { ChatItem, Message, SystemPromptPreset, UserMessage, AssistantTextMessage, MessageImage } from '../types/chat';
import { ImageFile } from '../utils/imageUtils';
import { throttle } from '../utils/throttle';
import { ToolService } from '../services/ToolService';

const toolService = ToolService.getInstance();

/**
 * Unified hook for managing all chat-related state and interactions.
 * This hook is the single source of truth for chat management in the UI.
 *
 * Architecture: Component → useChatManager Hook → Zustand Store → Services
 */
export const useChatManager = () => {
  const { modal } = AntApp.useApp();

  // --- STATE SELECTION FROM ZUSTAND ---
  const chats = useAppStore(state => state.chats);
  const currentChatId = useAppStore(state => state.currentChatId);
  const addChat = useAppStore(state => state.addChat);
  const setMessages = useAppStore(state => state.setMessages);
  const addMessage = useAppStore(state => state.addMessage);
  const selectChat = useAppStore(state => state.selectChat);
  const deleteChat = useAppStore(state => state.deleteChat);
  const deleteChats = useAppStore(state => state.deleteChats);
  const deleteMessage = useAppStore(state => state.deleteMessage);
  const updateChat = useAppStore(state => state.updateChat);
  const pinChat = useAppStore(state => state.pinChat);
  const unpinChat = useAppStore(state => state.unpinChat);
  const loadChats = useAppStore(state => state.loadChats);
  const saveChats = useAppStore(state => state.saveChats);
  const updateMessageContent = useAppStore(state => state.updateMessageContent);

  // --- DERIVED STATE ---
  const currentChat = useMemo(() => chats.find(chat => chat.id === currentChatId) || null, [chats, currentChatId]);
  const currentMessages = useMemo(() => currentChat?.messages || [], [currentChat]);
  const pinnedChats = useMemo(() => chats.filter(chat => chat.pinned), [chats]);
  const unpinnedChats = useMemo(() => chats.filter(chat => !chat.pinned), [chats]);
  const chatCount = chats.length;

  // --- CHAT INTERACTION STATE MACHINE (from useChatController) ---
  const [state, send] = useMachine(chatMachine);
  const prevStateRef = useRef(state);
  const streamingMessageIdRef = useRef<string | null>(null);
  const prevChatIdRef = useRef<string | null>(null);

  const throttledUpdateMessageContent = useMemo(
    () => throttle(updateMessageContent, 100),
    [updateMessageContent]
  );

  // Reset state machine when chat changes
  useEffect(() => {
    if (prevChatIdRef.current && prevChatIdRef.current !== currentChatId) {
      send({ type: 'CANCEL' });
      streamingMessageIdRef.current = null;
    }
    prevChatIdRef.current = currentChatId;
  }, [currentChatId, send]);

  // Handle state machine side-effects
  useEffect(() => {
    const prevState = prevStateRef.current;
    if (JSON.stringify(state.value) === JSON.stringify(prevState.value)) return;

    console.log(`[ChatManager] State changed: ${JSON.stringify(state.value)}`);

    if (state.matches('THINKING') && !prevState.matches('THINKING')) {
      if (currentChatId) {
        const newStreamingMessage: AssistantTextMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          type: 'text',
          content: '',
          createdAt: new Date().toISOString(),
        };
        streamingMessageIdRef.current = newStreamingMessage.id;
        addMessage(currentChatId, newStreamingMessage);
      }
    }

    if (state.matches('IDLE') && !prevState.matches('IDLE')) {
      if (currentChatId && streamingMessageIdRef.current && state.context.finalContent) {
        updateMessageContent(currentChatId, streamingMessageIdRef.current, state.context.finalContent);
      }
      if (currentChatId && state.context.messages.length > 0) {
        setMessages(currentChatId, state.context.messages);
      }
      streamingMessageIdRef.current = null;
    }
    
    if (
      (prevState.matches('CHECKING_APPROVAL') && !state.matches('CHECKING_APPROVAL')) ||
      (state.matches('AWAITING_APPROVAL') && !prevState.matches('AWAITING_APPROVAL'))
    ) {
      if (currentChatId) {
        setMessages(currentChatId, state.context.messages);
      }
    }

    prevStateRef.current = state;
  }, [state.value, state.context, currentChatId, addMessage, updateMessageContent, setMessages]);

  // Handle streaming content updates
  useEffect(() => {
    if (state.context.streamingContent && currentChatId && streamingMessageIdRef.current) {
      throttledUpdateMessageContent(currentChatId, streamingMessageIdRef.current, state.context.streamingContent);
    }
  }, [state.context.streamingContent, currentChatId, throttledUpdateMessageContent]);


  // --- ACTIONS ---

  const sendMessage = useCallback(async (content: string, images?: ImageFile[]) => {
    if (!currentChat) {
      modal.info({
        title: 'No Active Chat',
        content: 'Please create or select a chat before sending a message.',
      });
      return;
    }
    const chatId = currentChat.id;
    const systemPromptId = currentChat.config.systemPromptId;

    // Perform validation
    const { processedContent, validation } = await toolService.processMessage(content, systemPromptId);
    if (!validation.isValid) {
      modal.error({
        title: 'Validation Error',
        content: validation.errorMessage,
      });
      return;
    }

    const messageImages: MessageImage[] = images?.map(img => ({
      id: img.id,
      base64: img.base64,
      name: img.name,
      size: img.size,
      type: img.type,
    })) || [];

    const userMessage: UserMessage = {
      role: "user",
      content: processedContent,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      images: messageImages,
    };

    addMessage(chatId, userMessage);

    const updatedHistory = [...currentChat.messages, userMessage];
    const updatedChat: ChatItem = { ...currentChat, messages: updatedHistory };

    const basicToolCall = toolService.parseUserCommand(processedContent);

    if (basicToolCall) {
      const toolInfo = await toolService.getToolInfo(basicToolCall.tool_name);
      const toolCallId = `call_${crypto.randomUUID()}`;
      const enhancedToolCall = {
        ...basicToolCall,
        toolCallId,
        parameter_parsing_strategy: toolInfo?.parameter_parsing_strategy,
      };
      send({ type: 'USER_INVOKES_TOOL', payload: { request: enhancedToolCall, messages: updatedHistory } });
    } else {
      send({
        type: 'USER_SUBMITS',
        payload: { messages: updatedHistory, chat: updatedChat },
      });
    }
  }, [currentChat, addMessage, send, modal]);

  const retryLastMessage = useCallback(async () => {
    if (!currentChat) return;
    const chatId = currentChat.id;
    const history = [...currentMessages];

    if (history.length === 0) return;

    const lastMessage = history[history.length - 1];
    let messagesToRetry = history;

    if (lastMessage?.role === 'assistant') {
      deleteMessage(chatId, lastMessage.id);
      messagesToRetry = history.slice(0, -1);
    }

    if (messagesToRetry.length > 0) {
      const updatedChat: ChatItem = { ...currentChat, messages: messagesToRetry };
      send({
        type: 'USER_SUBMITS',
        payload: { messages: messagesToRetry, chat: updatedChat },
      });
    }
  }, [currentChat, currentMessages, deleteMessage, send]);

  const createNewChat = useCallback((title?: string, options?: Partial<Omit<ChatItem, 'id'>>) => {
    const newChatData: Omit<ChatItem, 'id'> = {
      title: title || 'New Chat',
      createdAt: Date.now(),
      messages: [],
      config: {
        systemPromptId: 'general_assistant',
        toolCategory: 'general_assistant',
        lastUsedEnhancedPrompt: null,
      },
      currentInteraction: null,
      ...options,
    };
    addChat(newChatData);
    saveChats();
  }, [addChat, saveChats]);

  const createChatWithSystemPrompt = useCallback((preset: SystemPromptPreset) => {
    const newChatData: Omit<ChatItem, 'id'> = {
      title: `New Chat - ${preset.name}`,
      createdAt: Date.now(),
      messages: [{
        id: 'system-prompt',
        role: 'system',
        content: preset.content,
        createdAt: new Date().toISOString(),
      }],
      config: {
        systemPromptId: preset.id,
        toolCategory: preset.category,
        lastUsedEnhancedPrompt: preset.content,
      },
      currentInteraction: null,
    };
    addChat(newChatData);
    saveChats();
  }, [addChat, saveChats]);

  const toggleChatPin = useCallback((chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
      chat.pinned ? unpinChat(chatId) : pinChat(chatId);
    }
  }, [chats, pinChat, unpinChat]);

  const updateChatTitle = useCallback((chatId: string, newTitle: string) => {
    updateChat(chatId, { title: newTitle });
  }, [updateChat]);

  const deleteEmptyChats = useCallback(() => {
    const emptyChatIds = chats.filter(chat => !chat.pinned && chat.messages.length === 0).map(chat => chat.id);
    if (emptyChatIds.length > 0) {
      deleteChats(emptyChatIds);
    }
  }, [chats, deleteChats]);

  const deleteAllUnpinnedChats = useCallback(() => {
    const unpinnedChatsIds = unpinnedChats.map(chat => chat.id);
    if (unpinnedChatsIds.length > 0) {
      deleteChats(unpinnedChatsIds);
    }
  }, [unpinnedChats, deleteChats]);

  return {
    // State
    chats,
    currentChatId,
    currentChat,
    currentMessages,
    pinnedChats,
    unpinnedChats,
    chatCount,
    interactionState: state,

    // Actions
    addMessage,
    deleteMessage,
    selectChat,
    deleteChat,
    deleteChats,
    pinChat,
    unpinChat,
    updateChat,
    loadChats,
    saveChats,
    createNewChat,
    createChatWithSystemPrompt,
    toggleChatPin,
    updateChatTitle,
    deleteEmptyChats,
    deleteAllUnpinnedChats,
    sendMessage,
    retryLastMessage,
    
    // Machine sender
    send,
  };
};
