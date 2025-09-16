import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '../store';
import { useMachine } from '@xstate/react';
import { chatMachine } from '../core/chatInteractionMachine';
import { Message, MessageImage, createContentWithImages } from '../types/chat';
import { ImageFile } from '../utils/imageUtils';
import { throttle } from '../utils/throttle';
import { ToolService } from '../services/ToolService';

const toolService = ToolService.getInstance();

export const useChatController = () => {
  const {
    currentChatId,
    addMessage,
    setMessages,
    updateMessageContent,
    deleteMessage, // Import deleteMessage
    messages: allMessages,
    chats,
  } = useAppStore();

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
        const newStreamingMessage: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
          isStreaming: true,
        };
        streamingMessageIdRef.current = newStreamingMessage.id;
        console.log(`[ChatController] THINKING: Creating new streaming message ${newStreamingMessage.id}`);
        addMessage(currentChatId, newStreamingMessage);
      }
    }

    // 2. Process finished (IDLE): Finalize the message and persist
    if (state.matches('IDLE') && !prevState.matches('IDLE')) {
      console.log('[ChatController] IDLE: Process finished.');
      if (currentChatId && streamingMessageIdRef.current) {
        const finalMessage = state.context.messages.find(m => m.id === streamingMessageIdRef.current);
        if (finalMessage) {
          console.log(`[ChatController] IDLE: Updating final content for message ${streamingMessageIdRef.current}`);
          // Bypass throttle for final update
          updateMessageContent(currentChatId, streamingMessageIdRef.current, finalMessage.content as string);
        }
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
    if (!currentChatId) {
      console.error("[ChatController] sendMessage: No active chat selected.");
      return;
    }
    console.log(`[ChatController] sendMessage: Received content: "${content}"`);

    const messageImages: MessageImage[] = images?.map(img => ({
      id: img.id,
      base64: img.base64,
      name: img.name,
      size: img.size,
      type: img.type,
    })) || [];

    const messageContent = messageImages.length > 0 ? createContentWithImages(content, messageImages) : content;

    const userMessage: Message = {
      role: "user",
      content: messageContent,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      images: messageImages,
    };

    // 1. Optimistic UI update: Add user message to Zustand immediately
    console.log(`[ChatController] sendMessage: Adding user message to store:`, userMessage);
    addMessage(currentChatId, userMessage);

    // 2. Check if the content is a direct tool command.
    const basicToolCall = toolService.parseUserCommand(content);
    const currentHistory = [...(allMessages[currentChatId] || []), userMessage];
    const chat = chats.find(c => c.id === currentChatId);

    if (!chat) {
      console.error("[ChatController] sendMessage: Current chat not found.");
      return;
    }

    if (basicToolCall) {
      // If it's a tool call, enhance it with the full tool info before sending to the machine.
      // This ensures the state machine has the `parameter_parsing_strategy` for routing.
      const toolInfo = await toolService.getToolInfo(basicToolCall.tool_name);
      const enhancedToolCall = {
        ...basicToolCall,
        parameter_parsing_strategy: toolInfo?.parameter_parsing_strategy,
      };
      
      console.log('[ChatController] sendMessage: Detected a direct tool command. Sending USER_INVOKES_TOOL with enhanced request.', enhancedToolCall);
      send({ type: 'USER_INVOKES_TOOL', payload: { request: enhancedToolCall, messages: currentHistory } });

    } else {
      // It's a normal message, send to AI for processing.
      console.log('[ChatController] sendMessage: Detected a normal message. Sending USER_SUBMITS.');
      send({
        type: 'USER_SUBMITS',
        payload: {
          messages: currentHistory,
          chat,
        },
      });
    }
  }, [currentChatId, allMessages, addMessage, send, chats]);

  const retryLastMessage = useCallback(async () => {
    if (!currentChatId) return;

    // Get messages from the reliable store, not the state machine context
    const currentMessages = allMessages[currentChatId] || [];
    if (currentMessages.length === 0) {
      console.log("No messages to retry.");
      return;
    }

    const lastMessage = currentMessages[currentMessages.length - 1];
    let messagesToRetry = [...currentMessages];

    // If the last message is from the assistant, remove it before retrying
    if (lastMessage && lastMessage.role === 'assistant') {
      // 1. Optimistically remove from the UI
      deleteMessage(currentChatId, lastMessage.id);
      // 2. Prepare the history for the new request
      messagesToRetry = currentMessages.slice(0, -1);
    }

    // Ensure we are not sending an empty history
    if (messagesToRetry.length > 0) {
      const chat = chats.find(c => c.id === currentChatId);
      if (!chat) {
        console.error("[ChatController] retryLastMessage: Current chat not found.");
        return;
      }
      // 3. Send the corrected history to the state machine
      send({
        type: 'USER_SUBMITS',
        payload: {
          messages: messagesToRetry,
          chat,
        },
      });
    } else {
      console.log("Cannot retry from an empty history.");
    }
  }, [currentChatId, allMessages, deleteMessage, send, chats]);

  const generateChatTitle = useCallback(async (chatId: string): Promise<string> => {
    const messages = allMessages[chatId];
    if (!messages || messages.length === 0) {
      return "New Chat";
    }
    // Simplified logic for title generation
    const userMessage = messages.find(m => m.role === 'user');
    return userMessage ? (userMessage.content as string).substring(0, 20) : "New Chat";
  }, [allMessages]);

  return { 
    state, 
    send,
    sendMessage, 
    retryLastMessage,
    generateChatTitle,
  };
};
