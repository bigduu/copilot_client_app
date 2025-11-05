import { StateCreator } from "zustand";
import { ChatItem, Message } from "../../types/chat";
import type { AppState } from "../";
import { transformMessageDTOToMessage } from "../../utils/messageTransformers";

export interface ChatSlice {
  // State
  chats: ChatItem[];
  currentChatId: string | null;
  latestActiveChatId: string | null; // Store the last active chat ID
  isProcessing: boolean;
  streamingMessage: { chatId: string; content: string } | null;
  autoGenerateTitles: boolean;
  isUpdatingAutoTitlePreference: boolean;

  // Actions
  addChat: (chat: Omit<ChatItem, "id">) => Promise<void>;
  selectChat: (chatId: string | null) => void;
  deleteChat: (chatId: string) => Promise<void>;
  deleteChats: (chatIds: string[]) => Promise<void>;
  updateChat: (chatId: string, updates: Partial<ChatItem>) => void;
  pinChat: (chatId: string) => void;
  unpinChat: (chatId: string) => void;

  addMessage: (chatId: string, message: Message) => Promise<void>;
  setMessages: (chatId: string, messages: Message[]) => void;
  updateMessage: (
    chatId: string,
    messageId: string,
    updates: Partial<Message>
  ) => void;
  updateMessageContent: (
    chatId: string,
    messageId: string,
    content: string
  ) => Promise<void>; // New action for streaming
  deleteMessage: (chatId: string, messageId: string) => void;

  loadChats: () => Promise<void>;

  setProcessing: (isProcessing: boolean) => void;
  setStreamingMessage: (
    streamingMessage: { chatId: string; content: string } | null
  ) => void;
  setAutoGenerateTitlesPreference: (enabled: boolean) => Promise<void>;
}

export const createChatSlice: StateCreator<AppState, [], [], ChatSlice> = (
  set,
  get
) => ({
  // Initial state
  chats: [],
  currentChatId: null,
  latestActiveChatId: null,
  isProcessing: false,
  streamingMessage: null,
  autoGenerateTitles: true,
  isUpdatingAutoTitlePreference: false,

  // Chat management actions
  addChat: async (chatData) => {
    console.log(
      "[ChatSlice] addChat action triggered with chatData.config:",
      (chatData as ChatItem).config
    );

    try {
      // Import BackendContextService dynamically to avoid circular dependency
      const { BackendContextService } = await import(
        "../../services/BackendContextService"
      );
      const backendService = new BackendContextService();

      // Create context in backend first
      const createResponse = await backendService.createContext({
        model_id: "gpt-4",
        mode: "chat",
        system_prompt_id:
          (chatData as ChatItem).config?.systemPromptId || undefined,
        workspace_path: (chatData as ChatItem).config?.workspacePath,
      });

      // Use the backend-generated ID
      const newChat: ChatItem = {
        id: createResponse.id,
        ...chatData,
      };

      set((state) => ({
        ...state,
        chats: [...state.chats, newChat],
        currentChatId: newChat.id,
        latestActiveChatId: newChat.id,
      }));

      console.log(`[ChatSlice] Created chat in backend with ID: ${newChat.id}`);
    } catch (error) {
      console.error("[ChatSlice] Failed to create chat in backend:", error);
      // Fallback to local-only chat (temporary, will not persist)
      const newChat: ChatItem = {
        id: crypto.randomUUID(),
        ...chatData,
      };

      set((state) => ({
        ...state,
        chats: [...state.chats, newChat],
        currentChatId: newChat.id,
        latestActiveChatId: newChat.id,
      }));
    }
  },

  selectChat: (chatId) => {
    set({ currentChatId: chatId, latestActiveChatId: chatId });

    // Persist the latest active chat ID asynchronously without blocking the UI
    void (async () => {
      try {
        const { UserPreferenceService } = await import(
          "../../services/UserPreferenceService"
        );
        const preferenceService = new UserPreferenceService();
        await preferenceService.updatePreferences({
          last_opened_chat_id: chatId ?? null,
        });
      } catch (error) {
        console.warn(
          "[ChatSlice] Failed to persist last opened chat preference:",
          error
        );
      }
    })();
    // Note: Message loading is now handled by the backend Context Manager
  },

  deleteChat: async (chatId) => {
    try {
      // Delete from backend first
      const { BackendContextService } = await import(
        "../../services/BackendContextService"
      );
      const backendService = new BackendContextService();
      await backendService.deleteContext(chatId);

      console.log(`[ChatSlice] Deleted chat from backend: ${chatId}`);
    } catch (error) {
      console.error("[ChatSlice] Failed to delete chat from backend:", error);
      // Continue with local deletion even if backend fails
    }

    // Update local state
    set((state) => {
      const newChats = state.chats.filter((chat) => chat.id !== chatId);
      let newCurrentChatId = state.currentChatId;
      let newLatestActiveChatId = state.latestActiveChatId;

      if (state.currentChatId === chatId) {
        newCurrentChatId = null;
      }

      if (state.latestActiveChatId === chatId) {
        newLatestActiveChatId = newChats.length > 0 ? newChats[0].id : null;
      }

      return {
        ...state,
        chats: newChats,
        currentChatId: newCurrentChatId,
        latestActiveChatId: newLatestActiveChatId,
      };
    });
  },

  deleteChats: async (chatIds) => {
    // Delete from backend first
    try {
      const { BackendContextService } = await import(
        "../../services/BackendContextService"
      );
      const backendService = new BackendContextService();

      // Delete each chat from backend
      await Promise.all(chatIds.map((id) => backendService.deleteContext(id)));

      console.log(`[ChatSlice] Deleted ${chatIds.length} chats from backend`);
    } catch (error) {
      console.error("[ChatSlice] Failed to delete chats from backend:", error);
      // Continue with local deletion even if backend fails
    }

    // Update local state
    set((state) => {
      const newChats = state.chats.filter((chat) => !chatIds.includes(chat.id));
      let newCurrentChatId = state.currentChatId;
      let newLatestActiveChatId = state.latestActiveChatId;

      if (chatIds.includes(state.currentChatId || "")) {
        newCurrentChatId = null;
      }

      if (chatIds.includes(state.latestActiveChatId || "")) {
        newLatestActiveChatId = newChats.length > 0 ? newChats[0].id : null;
      }

      return {
        ...state,
        chats: newChats,
        currentChatId: newCurrentChatId,
        latestActiveChatId: newLatestActiveChatId,
      };
    });
  },

  updateChat: (chatId, updates) => {
    set((state) => ({
      ...state,
      chats: state.chats.map((chat) =>
        chat.id === chatId ? { ...chat, ...updates } : chat
      ),
    }));
  },

  pinChat: (chatId) => {
    get().updateChat(chatId, { pinned: true });
  },

  unpinChat: (chatId) => {
    get().updateChat(chatId, { pinned: false });
  },

  // Message management (now operates on the messages array within each ChatItem)
  setMessages: (chatId, messages) => {
    const chat = get().chats.find((c) => c.id === chatId);
    if (chat) {
      get().updateChat(chatId, { messages });
    }
  },

  addMessage: async (chatId, message) => {
    const chat = get().chats.find((c) => c.id === chatId);
    if (chat) {
      // Update local state first (optimistic update)
      get().updateChat(chatId, { messages: [...chat.messages, message] });

      // ⚠️ IMPORTANT: For USER messages, use sendMessageAction instead!
      // This addMessage should only be used for local optimistic updates.
      // The backend action API handles all persistence automatically.

      // Only persist non-user messages directly (assistant placeholders, tool results, etc.)
      // User messages should go through sendMessageAction which triggers FSM
      if (message.role === "user") {
        console.log(
          `[ChatSlice] User message added locally - backend will persist via action API`
        );
        return;
      }

      // For assistant/system/tool messages, use old persistence (temporary)
      try {
        const { BackendContextService } = await import(
          "../../services/BackendContextService"
        );
        const backendService = new BackendContextService();

        // Convert message content to string if needed
        let contentText = "";
        if (message.role === "system") {
          contentText = message.content;
        } else if (message.role === "assistant") {
          if (message.type === "text") {
            contentText = message.content;
          } else if (message.type === "tool_call") {
            contentText = `Tool calls: ${message.toolCalls
              .map((tc) => tc.toolName)
              .join(", ")}`;
          } else if (message.type === "tool_result") {
            contentText = `Tool result from ${message.toolName}`;
          }
        }

        // Don't save empty assistant messages (streaming placeholders)
        if (message.role === "assistant" && !contentText.trim()) {
          console.log(
            `[ChatSlice] Skipping empty assistant message for chat ${chatId}`
          );
          return;
        }

        await backendService.addMessage(chatId, {
          role: message.role,
          content: contentText,
        });

        console.log(`[ChatSlice] Saved message to backend for chat ${chatId}`);
      } catch (error) {
        console.error("[ChatSlice] Failed to save message to backend:", error);
      }
    }
  },

  updateMessage: (chatId, messageId, updates) => {
    const chat = get().chats.find((c) => c.id === chatId);
    if (chat) {
      const updatedMessages = chat.messages.map((msg) => {
        if (msg.id === messageId) {
          // Perform a type-safe update by only applying properties that exist on the original message.
          const updatedMsg = { ...msg };
          Object.keys(updates).forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(updatedMsg, key)) {
              (updatedMsg as any)[key] = (updates as any)[key];
            }
          });
          return updatedMsg;
        }
        return msg;
      });
      get().updateChat(chatId, { messages: updatedMessages });
    }
  },

  updateMessageContent: async (chatId, messageId, content) => {
    const chat = get().chats.find((c) => c.id === chatId);
    if (chat) {
      // Update local state first
      const updatedMessages = chat.messages.map((msg) => {
        if (msg.id === messageId) {
          if (
            msg.role === "user" ||
            (msg.role === "assistant" && msg.type === "text")
          ) {
            return { ...msg, content };
          }
        }
        return msg;
      });
      get().updateChat(chatId, { messages: updatedMessages });

      // TODO [REFACTOR-BACKEND-FIRST]: Remove manual persistence
      // ============================================================
      // This manual backend save should be removed once we migrate to the
      // action-based API. The backend FSM auto-saves after every state transition,
      // including when streaming completes. See: openspec/changes/refactor-backend-first-persistence
      //
      // Migration steps:
      // 1. Backend streaming should end with FSM auto-save
      // 2. Frontend polls for updates via useChatStateSync
      // 3. Remove this manual persistence block entirely
      // 4. Keep local state update for optimistic UI
      // ============================================================

      // Save the complete message to backend (this is the final content after streaming)
      try {
        // Only save assistant messages with content (skip empty ones)
        if (content.trim()) {
          const { BackendContextService } = await import(
            "../../services/BackendContextService"
          );
          const backendService = new BackendContextService();

          // Find the message to get its role
          const message = chat.messages.find((m) => m.id === messageId);
          if (message) {
            await backendService.addMessage(chatId, {
              role: message.role,
              content: content,
            });

            console.log(
              `[ChatSlice] Saved final message content to backend for chat ${chatId}`
            );
          }
        }
      } catch (error) {
        console.error(
          "[ChatSlice] Failed to save final message to backend:",
          error
        );
      }
    }
  },

  deleteMessage: (chatId, messageId) => {
    const chat = get().chats.find((c) => c.id === chatId);
    if (chat) {
      const updatedMessages = chat.messages.filter(
        (msg) => msg.id !== messageId
      );
      get().updateChat(chatId, { messages: updatedMessages });
    }
  },

  // Data persistence
  // Load chat data from backend Context Manager
  loadChats: async () => {
    try {
      // Import BackendContextService dynamically to avoid circular dependency
      const { BackendContextService } = await import(
        "../../services/BackendContextService"
      );
      const backendService = new BackendContextService();

      // Load all contexts from backend
      const contexts = await backendService.listContexts();

      // Convert backend contexts to ChatItems
      const chats: ChatItem[] = await Promise.all(
        contexts.map(async (context) => {
          // Fetch messages for each context
          const messagesResponse = await backendService.getMessages(context.id);

          // Convert backend messages to frontend message format
          const messages: Message[] = messagesResponse.messages.map(
            transformMessageDTOToMessage
          );

          return {
            id: context.id,
            title: context.active_branch_name || "Chat",
            createdAt: Date.now(),
            messages,
            config: {
              systemPromptId: context.config.system_prompt_id ?? "",
              baseSystemPrompt: "",
              toolCategory: "general",
              lastUsedEnhancedPrompt: null,
              workspacePath: context.config.workspace_path || undefined,
            },
            currentInteraction: null,
          };
        })
      );

      let preferredChatId: string | null = null;
      let latestActiveChatId: string | null =
        chats.length > 0 ? chats[0].id : null;
      let autoGenerateTitlesPref = get().autoGenerateTitles;

      if (chats.length > 0) {
        try {
          const { UserPreferenceService } = await import(
            "../../services/UserPreferenceService"
          );
          const preferenceService = new UserPreferenceService();
          const prefs = await preferenceService.getPreferences();
          const storedChatId = prefs?.last_opened_chat_id ?? null;
          if (typeof prefs?.auto_generate_titles === "boolean") {
            autoGenerateTitlesPref = prefs.auto_generate_titles;
          }

          if (storedChatId) {
            const matchingChat = chats.find((chat) => chat.id === storedChatId);
            if (matchingChat) {
              preferredChatId = matchingChat.id;
              latestActiveChatId = matchingChat.id;
            } else if (chats.length > 0) {
              preferredChatId = chats[0].id;
              latestActiveChatId = chats[0].id;

              await preferenceService.updatePreferences({
                last_opened_chat_id: preferredChatId,
              });
            }
          }
        } catch (prefError) {
          console.warn(
            "[ChatSlice] Failed to load last opened chat preference:",
            prefError
          );
        }
      }

      if (!preferredChatId && chats.length > 0) {
        preferredChatId = chats[0].id;
        latestActiveChatId = chats[0].id;
      }

      set({
        chats,
        latestActiveChatId,
        currentChatId: preferredChatId,
        isProcessing: false,
        streamingMessage: null,
        autoGenerateTitles: autoGenerateTitlesPref,
      });

      console.log(`[ChatSlice] Loaded ${chats.length} chats from backend`);
    } catch (error) {
      console.error("Failed to load chats from backend:", error);
      // Initialize with empty state on error
      set({
        chats: [],
        latestActiveChatId: null,
        currentChatId: null,
        isProcessing: false,
        streamingMessage: null,
        autoGenerateTitles: get().autoGenerateTitles,
      });
    }
  },

  setProcessing: (isProcessing) => {
    set({ isProcessing });
  },

  setStreamingMessage: (streamingMessage) => {
    set({ streamingMessage });
  },

  setAutoGenerateTitlesPreference: async (enabled) => {
    const previousValue = get().autoGenerateTitles;
    set({ autoGenerateTitles: enabled, isUpdatingAutoTitlePreference: true });
    try {
      const { UserPreferenceService } = await import(
        "../../services/UserPreferenceService"
      );
      const preferenceService = new UserPreferenceService();
      await preferenceService.updatePreferences({
        auto_generate_titles: enabled,
      });
    } catch (error) {
      console.warn(
        "[ChatSlice] Failed to update auto-generate titles preference:",
        error
      );
      set({ autoGenerateTitles: previousValue });
      throw error;
    } finally {
      set({ isUpdatingAutoTitlePreference: false });
    }
  },
});
