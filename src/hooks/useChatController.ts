import { useCallback, useEffect, useMemo, useRef } from 'react';
import { App as AntApp } from 'antd';
import { useAppStore } from '../store';
import { useMachine } from '@xstate/react';
import { chatMachine } from '../core/chatInteractionMachine';
import { Message, MessageImage, UserMessage, AssistantTextMessage, ChatItem } from '../types/chat';
import { ImageFile } from '../utils/imageUtils';
import { throttle } from '../utils/throttle';
import { ToolService } from '../services/ToolService';
import { useChatList } from './useChatList'; // Import the corrected hook

const toolService = ToolService.getInstance();

export const useChatController = () => {
  const { modal } = AntApp.useApp();
  // Use the reliable, corrected useChatList hook as the source of truth
  const {
    currentChat,
    currentMessages,
    addMessage,
    setMessages,
    updateChat,
    deleteMessage,
  } = useChatList();
  const currentChatId = currentChat?.id || null;

  // Get the raw state updater for streaming, as it's performance-critical
  const updateMessageContent = useAppStore(state => state.updateMessageContent);

  // Create a throttled version of the update function to prevent excessive re-renders
  const throttledUpdateMessageContent = useMemo(
    () => throttle(updateMessageContent, 100), // Update at most every 100ms
    [updateMessageContent]
  );

  const [state, send] = useMachine(chatMachine);
  const prevStateRef = useRef(state);
  const streamingMessageIdRef = useRef<string | null>(null);
  const prevChatIdRef = useRef<string | null>(null);

  // 当 chatId 改变时，重置状态机
  useEffect(() => {
    if (prevChatIdRef.current && prevChatIdRef.current !== currentChatId) {
      send({ type: 'CANCEL' });
      streamingMessageIdRef.current = null;
    }
    prevChatIdRef.current = currentChatId;
  }, [currentChatId, send]);

  // Effect 1: Handle state transitions and one-off actions
  useEffect(() => {
    const prevState = prevStateRef.current;
    const currentStateValue = JSON.stringify(state.value);
    const prevStateValue = JSON.stringify(prevState.value);

    if (currentStateValue === prevStateValue) return; // Only run on state value changes

    console.log(`[ChatController] State changed: ${currentStateValue}, Prev: ${prevStateValue}`);

    // 1. Entering THINKING: Create a placeholder message
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
        console.log(`[ChatController] THINKING: Creating new streaming message ${newStreamingMessage.id}`);
        addMessage(currentChatId, newStreamingMessage);
      }
    }

    // 2. Process finished (IDLE): Finalize the message and persist
    if (state.matches('IDLE') && !prevState.matches('IDLE')) {
      console.log('[ChatController] IDLE: Process finished.');
      if (currentChatId && streamingMessageIdRef.current && state.context.finalContent) {
        console.log(`[ChatController] IDLE: Updating final content for message ${streamingMessageIdRef.current}`);
        // Bypass throttle for final update and use the definitive final content
        updateMessageContent(currentChatId, streamingMessageIdRef.current, state.context.finalContent);
      }
      if (currentChatId && state.context.messages.length > 0) {
        console.log('[ChatController] IDLE: Persisting final messages to Zustand.');
        setMessages(currentChatId, state.context.messages);
      }
      streamingMessageIdRef.current = null;
    }

    // 3. Sync messages after tool-related state changes
    if (
      (prevState.matches('CHECKING_APPROVAL') && !state.matches('CHECKING_APPROVAL')) ||
      (state.matches('AWAITING_APPROVAL') && !prevState.matches('AWAITING_APPROVAL'))
    ) {
      if (currentChatId) {
        console.log('[ChatController] Syncing messages due to tool approval state change.');
        setMessages(currentChatId, state.context.messages);
      }
    }

    prevStateRef.current = state;
  }, [state.value, state.context.messages, currentChatId, addMessage, updateMessageContent, setMessages]);

  // Effect 2: Handle streaming content updates
  useEffect(() => {
    if (state.context.streamingContent && currentChatId && streamingMessageIdRef.current) {
      throttledUpdateMessageContent(currentChatId, streamingMessageIdRef.current, state.context.streamingContent);
    }
  }, [state.context.streamingContent, currentChatId, throttledUpdateMessageContent]);

  const sendMessage = useCallback(async (content: string, images?: ImageFile[]) => {
    if (!currentChat) {
      console.error("[ChatController] sendMessage: No active chat selected.");
      modal.info({
        title: 'No Active Chat',
        content: 'Please create or select a chat before sending a message.',
        okText: 'OK',
      });
      return;
    }
    const chatId = currentChat.id;
    console.log(`[ChatController] sendMessage: Received content: "${content}"`);

    const messageImages: MessageImage[] = images?.map(img => ({
      id: img.id,
      base64: img.base64,
      name: img.name,
      size: img.size,
      type: img.type,
    })) || [];

    const userMessage: UserMessage = {
      role: "user",
      content: content,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      images: messageImages,
    };

    // 1. Optimistic UI update: Add user message to Zustand immediately
    console.log(`[ChatController] sendMessage: Adding user message to store:`, userMessage);
    addMessage(chatId, userMessage);

    // 2. Prepare the payload for the state machine using the LATEST data.
    // The history now includes the message we just added.
    const updatedHistory = [...currentChat.messages, userMessage];
    const updatedChat: ChatItem = {
      ...currentChat,
      messages: updatedHistory,
    };

    // 3. Check if the content is a direct tool command.
    const basicToolCall = toolService.parseUserCommand(content);

    if (basicToolCall) {
      // If it's a tool call, enhance it with the full tool info before sending to the machine.
      // This ensures the state machine has the `parameter_parsing_strategy` for routing.
      const toolInfo = await toolService.getToolInfo(basicToolCall.tool_name);
      const toolCallId = `call_${crypto.randomUUID()}`;
      const enhancedToolCall = {
        ...basicToolCall,
        toolCallId,
        parameter_parsing_strategy: toolInfo?.parameter_parsing_strategy,
      };
      
      console.log('[ChatController] sendMessage: Detected a direct tool command. Sending USER_INVOKES_TOOL with enhanced request.', enhancedToolCall);
      // Pass the updated history to the machine
      send({ type: 'USER_INVOKES_TOOL', payload: { request: enhancedToolCall, messages: updatedHistory } });

    } else {
      // It's a normal message, send to AI for processing.
      console.log('[ChatController] sendMessage: Detected a normal message. Sending USER_SUBMITS.');
      // Pass the updated chat object and its messages to the machine
      send({
        type: 'USER_SUBMITS',
        payload: {
          messages: updatedHistory,
          chat: updatedChat,
        },
      });
    }
  }, [currentChat, addMessage, send]);

  const retryLastMessage = useCallback(async () => {
    if (!currentChat) return;

    const chatId = currentChat.id;
    const history = [...currentChat.messages]; // Use messages from the reliable currentChat

    if (history.length === 0) {
      console.log("No messages to retry.");
      return;
    }

    const lastMessage = history[history.length - 1];
    let messagesToRetry = history;

    // If the last message is from the assistant, remove it before retrying
    if (lastMessage && lastMessage.role === 'assistant') {
      // 1. Optimistically remove from the UI
      deleteMessage(chatId, lastMessage.id);
      // 2. Prepare the history for the new request
      messagesToRetry = history.slice(0, -1);
    }

    // Ensure we are not sending an empty history
    if (messagesToRetry.length > 0) {
      const updatedChat: ChatItem = {
        ...currentChat,
        messages: messagesToRetry,
      };
      // 3. Send the corrected history to the state machine
      send({
        type: 'USER_SUBMITS',
        payload: {
          messages: messagesToRetry,
          chat: updatedChat,
        },
      });
    } else {
      console.log("Cannot retry from an empty history.");
    }
  }, [currentChat, deleteMessage, send]);

  const generateChatTitle = useCallback(async (chatId: string): Promise<string> => {
    // This function is less critical now, but let's make it use the new structure.
    const chat = useAppStore.getState().chats.find(c => c.id === chatId);
    const messages = chat?.messages || [];
    if (messages.length === 0) {
      return "New Chat";
    }
    const userMessage = messages.find(m => m.role === 'user') as UserMessage | undefined;
    return userMessage ? userMessage.content.substring(0, 20) : "New Chat";
  }, []);

  return { 
    state, 
    send,
    sendMessage, 
    retryLastMessage,
    generateChatTitle,
  };
};
