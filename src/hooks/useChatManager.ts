import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App as AntApp } from "antd";
import { useAppStore } from "../store";
import { useMachine } from "@xstate/react";
import { chatMachine, ChatMachineEvent } from "../core/chatInteractionMachine";
import {
  ChatItem,
  UserSystemPrompt,
  UserMessage,
  AssistantTextMessage,
  MessageImage,
  Message,
} from "../types/chat";
import { ImageFile } from "../utils/imageUtils";
import { ToolService } from "../services/ToolService";
import SystemPromptEnhancer from "../services/SystemPromptEnhancer";

const toolService = ToolService.getInstance();

/**
 * Unified hook for managing all chat-related state and interactions.
 * This hook is the single source of truth for chat management in the UI.
 */
export const useChatManager = () => {
  const { modal } = AntApp.useApp();

  // --- STATE SELECTION FROM ZUSTAND ---
  const chats = useAppStore((state) => state.chats);
  const currentChatId = useAppStore((state) => state.currentChatId);
  const addChat = useAppStore((state) => state.addChat);
  const setMessages = useAppStore((state) => state.setMessages);
  const addMessage = useAppStore((state) => state.addMessage);
  const selectChat = useAppStore((state) => state.selectChat);
  const deleteChat = useAppStore((state) => state.deleteChat);
  const deleteChats = useAppStore((state) => state.deleteChats);
  const deleteMessage = useAppStore((state) => state.deleteMessage);
  const updateChat = useAppStore((state) => state.updateChat);
  const pinChat = useAppStore((state) => state.pinChat);
  const unpinChat = useAppStore((state) => state.unpinChat);
  const loadChats = useAppStore((state) => state.loadChats);
  const updateMessageContent = useAppStore(
    (state) => state.updateMessageContent
  );
  const lastSelectedPromptId = useAppStore(
    (state) => state.lastSelectedPromptId
  );
  const systemPrompts = useAppStore((state) => state.systemPrompts);

  // --- DERIVED STATE ---
  const currentChat = useMemo(
    () => chats.find((chat) => chat.id === currentChatId) || null,
    [chats, currentChatId]
  );
  const baseMessages = useMemo(
    () => currentChat?.messages || [],
    [currentChat]
  );
  const pinnedChats = useMemo(
    () => chats.filter((chat) => chat.pinned),
    [chats]
  );
  const unpinnedChats = useMemo(
    () => chats.filter((chat) => !chat.pinned),
    [chats]
  );
  const chatCount = chats.length;

  // --- LOCAL UI STATE FOR STREAMING ---
  const [streamingText, setStreamingText] = useState("");
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null
  );

  // --- CHAT INTERACTION STATE MACHINE ---
  // Provide the concrete implementations for the actions defined in the machine
  const providedChatMachine = useMemo(() => {
    return chatMachine.provide({
      actions: {
        forwardChunkToUI: ({ event }: { event: ChatMachineEvent }) => {
          if (event.type === "CHUNK_RECEIVED") {
            setStreamingText((prev) => prev + event.payload.chunk);
          }
        },
        finalizeStreamingMessage: async ({ event }: { event: ChatMachineEvent }) => {
          const { currentChatId: chatId } = useAppStore.getState();
          if (
            event.type === "STREAM_COMPLETE_TEXT" &&
            streamingMessageId &&
            chatId
          ) {
            await updateMessageContent(
              chatId,
              streamingMessageId,
              event.payload.finalContent
            );
            // Reset local streaming UI state
            setStreamingMessageId(null);
            setStreamingText("");
          }
        },
      },
    });
  }, [streamingMessageId, updateMessageContent]);

  const [state, send] = useMachine(providedChatMachine);
  const prevStateRef = useRef(state);
  const prevChatIdRef = useRef<string | null>(null);

  // --- FINAL MESSAGES FOR UI ---
  // This combines the persisted messages from Zustand with the live streaming text
  const currentMessages = useMemo(() => {
    if (!streamingMessageId) {
      return baseMessages;
    }
    // Ensure the streaming message placeholder is part of the list
    const messageExists = baseMessages.some(
      (msg) => msg.id === streamingMessageId
    );
    const list = messageExists
      ? baseMessages
      : [
          ...baseMessages,
          {
            id: streamingMessageId,
            role: "assistant",
            type: "text",
            content: "",
            createdAt: new Date().toISOString(),
          } as AssistantTextMessage,
        ];

    return list.map((msg) =>
      msg.id === streamingMessageId ? { ...msg, content: streamingText } : msg
    );
  }, [baseMessages, streamingMessageId, streamingText]);

  // Reset state machine when chat changes
  useEffect(() => {
    if (prevChatIdRef.current && prevChatIdRef.current !== currentChatId) {
      send({ type: "CANCEL" });
      setStreamingMessageId(null);
      setStreamingText("");
    }
    prevChatIdRef.current = currentChatId;
  }, [currentChatId, send]);

  // Handle side-effects based on state transitions (NOT events)
  useEffect(() => {
    const { currentChatId: chatId } = useAppStore.getState();
    if (!chatId) return;

    const prevState = prevStateRef.current;

    if (state.value === prevState.value) {
      return;
    }

    console.log(
      `[ChatManager] State changed from ${JSON.stringify(
        prevState.value
      )} to ${JSON.stringify(state.value)}`
    );

    // --- Handle entering THINKING state ---
    if (state.matches("THINKING") && !prevState.matches("THINKING")) {
      const newStreamingMessage: AssistantTextMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        type: "text",
        content: "",
        createdAt: new Date().toISOString(),
      };
      addMessage(chatId, newStreamingMessage);
      setStreamingMessageId(newStreamingMessage.id);
      setStreamingText("");
    }

    // --- Sync message list on other state changes ---
    // This ensures that tool calls and other non-streaming updates are reflected.
    if (state.context.messages.length !== prevState.context.messages.length) {
      setMessages(chatId, state.context.messages);
    }

    prevStateRef.current = state;
  }, [state, addMessage, setMessages]);

  // --- ACTIONS ---

  const sendMessage = useCallback(
    async (content: string, images?: ImageFile[]) => {
      if (!currentChat) {
        modal.info({
          title: "No Active Chat",
          content: "Please create or select a chat before sending a message.",
        });
        return;
      }
      console.log(
        "[ChatManager] sendMessage: currentChat.config on entry:",
        currentChat.config
      );
      const chatId = currentChat.id;

      const processedContent = content;

      const messageImages: MessageImage[] =
        images?.map((img) => ({
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

      // ✅ NEW BACKEND-FIRST APPROACH:
      // Add user message locally for optimistic UI update (no backend persistence)
      await addMessage(chatId, userMessage);

      const updatedHistory = [...baseMessages, userMessage];
      const updatedChat: ChatItem = {
        ...currentChat,
        messages: updatedHistory,
      };

      // Check if this is a direct tool invocation command
      const basicToolCall = toolService.parseUserCommand(processedContent);

      if (basicToolCall) {
        // Direct tool command - use existing flow
        const toolInfo = await toolService.getToolInfo(basicToolCall.tool_name);
        const toolCallId = `call_${crypto.randomUUID()}`;
        const enhancedToolCall = {
          ...basicToolCall,
          toolCallId,
          parameter_parsing_strategy: toolInfo?.parameter_parsing_strategy,
        };
        send({
          type: "USER_INVOKES_TOOL",
          payload: { request: enhancedToolCall, messages: updatedHistory },
        });
      } else {
        // ✅ Normal message - Use backend action API
        // Backend will: save user message → run FSM → generate response → save response
        console.log(`[ChatManager] Calling backend action API for chat ${chatId}`);
        
        try {
          const { BackendContextService } = await import(
            "../services/BackendContextService"
          );
          const backendService = new BackendContextService();
          const actionResponse = await backendService.sendMessageAction(chatId, processedContent);
          
          console.log(`[ChatManager] Backend action completed:`, actionResponse);
          console.log(`[ChatManager] Backend returned context with ${actionResponse.context.message_count} messages`);
          
          // ✅ Backend has already generated and saved the assistant response
          // Now we need to update the frontend state with the backend's response
          
          // Extract assistant message from backend response
          const messages = await backendService.getMessages(chatId);
          const allMessages: Message[] = messages.messages.map((msg) => {
            const baseContent = msg.content
              .map((c) => {
                if (c.type === "text") return c.text;
                if (c.type === "image") return c.url;
                return "";
              })
              .join("\n") || "";
            
            const roleLower = msg.role.toLowerCase();
            
            if (roleLower === "user") {
              return {
                id: msg.id,
                role: "user",
                content: baseContent,
                createdAt: new Date().toISOString(),
              } as Message;
            } else if (roleLower === "assistant") {
              return {
                id: msg.id,
                role: "assistant",
                type: "text",
                content: baseContent,
                createdAt: new Date().toISOString(),
              } as Message;
            }
            return null;
          }).filter(Boolean) as Message[];
          
          // Update local state with backend messages
          setMessages(chatId, allMessages);
          
          console.log(`[ChatManager] Updated local state with ${allMessages.length} messages from backend`);
        } catch (error) {
          console.error("[ChatManager] Backend action failed:", error);
          modal.error({
            title: "Failed to send message",
            content: "Could not connect to backend. Please try again.",
          });
        }
      }
    },
    [currentChat, addMessage, send, modal, baseMessages, systemPrompts, setMessages]
  );

  const retryLastMessage = useCallback(async () => {
    if (!currentChat) return;
    const chatId = currentChat.id;
    const history = [...baseMessages];

    if (history.length === 0) return;

    const lastMessage = history[history.length - 1];
    let messagesToRetry = history;

    if (lastMessage?.role === "assistant") {
      deleteMessage(chatId, lastMessage.id);
      messagesToRetry = history.slice(0, -1);
    }

    if (messagesToRetry.length > 0) {
      const updatedChat: ChatItem = {
        ...currentChat,
        messages: messagesToRetry,
      };
      send({
        type: "USER_SUBMITS",
        payload: { messages: messagesToRetry, chat: updatedChat, systemPrompts },
      });
    }
  }, [currentChat, baseMessages, deleteMessage, send, systemPrompts]);

  const createNewChat = useCallback(
    async (title?: string, options?: Partial<Omit<ChatItem, "id">>) => {
      const selectedPrompt = systemPrompts.find(
        (p) => p.id === lastSelectedPromptId
      );

      const newChatData: Omit<ChatItem, "id"> = {
        title: title || "New Chat",
        createdAt: Date.now(),
        messages: [],
        config: {
          systemPromptId: selectedPrompt?.id || "default-general",
          baseSystemPrompt:
            selectedPrompt?.content || "You are a helpful assistant.",
          toolCategory: "general",
          lastUsedEnhancedPrompt: null,
        },
        currentInteraction: null,
        ...options,
      };
      await addChat(newChatData);
    },
    [addChat, lastSelectedPromptId, systemPrompts]
  );

  const createChatWithSystemPrompt = useCallback(
    async (prompt: UserSystemPrompt) => {
      console.log(
        "[ChatManager] createChatWithSystemPrompt started with prompt:",
        prompt
      );
      const enhancedPrompt = await SystemPromptEnhancer.getEnhancedSystemPrompt(
        prompt.content
      );

      const newChatData: Omit<ChatItem, "id"> = {
        title: `New Chat - ${prompt.name}`,
        createdAt: Date.now(),
        messages: [
          {
            id: "system-prompt",
            role: "system",
            content: enhancedPrompt,
            createdAt: new Date().toISOString(),
          },
        ],
        config: {
          systemPromptId: prompt.id,
          baseSystemPrompt: prompt.content, // Store the original prompt content
          toolCategory: "dynamic", // A new category to signify dynamic tool usage
          lastUsedEnhancedPrompt: enhancedPrompt,
        },
        currentInteraction: null,
      };
      console.log(
        "[ChatManager] Calling addChat with newChatData.config:",
        newChatData.config
      );
      await addChat(newChatData);
    },
    [addChat]
  );

  const toggleChatPin = useCallback(
    (chatId: string) => {
      const chat = chats.find((c) => c.id === chatId);
      if (chat) {
        chat.pinned ? unpinChat(chatId) : pinChat(chatId);
      }
    },
    [chats, pinChat, unpinChat]
  );

  const updateChatTitle = useCallback(
    (chatId: string, newTitle: string) => {
      updateChat(chatId, { title: newTitle });
    },
    [updateChat]
  );

  const deleteEmptyChats = useCallback(() => {
    const emptyChatIds = chats
      .filter((chat) => !chat.pinned && chat.messages.length === 0)
      .map((chat) => chat.id);
    if (emptyChatIds.length > 0) {
      deleteChats(emptyChatIds);
    }
  }, [chats, deleteChats]);

  const deleteAllUnpinnedChats = useCallback(() => {
    const unpinnedChatsIds = unpinnedChats.map((chat) => chat.id);
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
