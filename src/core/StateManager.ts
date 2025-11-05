import { StateManager as IStateManager } from "../interfaces/chat-manager";
import {
  ChatState,
  StateUpdates,
  StateListener,
  Unsubscribe,
  ExtendedMessage,
  // OperationResult
} from "../types/unified-chat";
import { ChatItem } from "../types/chat";

/**
 * Unified State Manager
 * Centralizes management of all chat states and provides state change notifications
 */
export class StateManager implements IStateManager {
  private state: ChatState;
  private messages: Map<string, ExtendedMessage[]> = new Map();
  private selectedMessages: string[] = [];
  private hiddenMessages: Set<string> = new Set();
  private metadata: Record<string, any> = {};
  private listeners = new Set<StateListener>();
  private transactionStack: Array<{
    id: string;
    previousState: ChatState;
    previousMessages: Map<string, ExtendedMessage[]>;
    previousSelectedMessages: string[];
    previousHiddenMessages: Set<string>;
    previousMetadata: Record<string, any>;
  }> = [];
  private initialized = false;

  constructor() {
    this.state = {
      chats: new Map<string, ChatItem>(),
      currentChatId: null,
      isProcessing: false,
      listeners: new Set<StateListener>(),
      transactions: new Map<string, any>(),
    };
  }

  /**
   * Get current state
   */
  getState(): ChatState {
    return { ...this.state };
  }

  /**
   * Update state and notify listeners
   */
  updateState(updates: StateUpdates): void {
    try {
      // Deep merge state updates
      this.state = this.mergeState(this.state, updates);

      // Notify all listeners
      this.notifyListeners();
    } catch (error) {
      console.error("State update failed:", error);
      throw new Error(
        `State update failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: StateListener): Unsubscribe {
    this.listeners.add(listener);

    // Immediately send the current state
    try {
      listener(this.getState());
    } catch (error) {
      console.error("Listener execution failed:", error);
    }

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Get specific chat
   */
  getChat(chatId: string): ChatItem | null {
    return this.state.chats.get(chatId) || null;
  }

  /**
   * Get all chats
   */
  getAllChats(): ChatItem[] {
    return Array.from(this.state.chats.values());
  }

  /**
   * Add chat
   */
  async addChat(chat: ChatItem): Promise<void> {
    try {
      this.state.chats.set(chat.id, chat);
      this.notifyListeners();
    } catch (error) {
      throw new Error(
        `Failed to add chat: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Update chat
   */
  async updateChat(chatId: string, chat: ChatItem): Promise<void> {
    try {
      if (!this.state.chats.has(chatId)) {
        throw new Error(`Chat does not exist: ${chatId}`);
      }

      this.state.chats.set(chatId, chat);
      this.notifyListeners();
    } catch (error) {
      throw new Error(
        `Failed to update chat: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Remove chat
   */
  async removeChat(chatId: string): Promise<void> {
    try {
      if (!this.state.chats.has(chatId)) {
        throw new Error(`Chat does not exist: ${chatId}`);
      }

      // Delete chat and all its messages
      this.state.chats.delete(chatId);
      this.messages.delete(chatId);

      // If it is the current chat, reset the current chat ID
      if (this.state.currentChatId === chatId) {
        this.state.currentChatId = null;
      }

      this.notifyListeners();
    } catch (error) {
      throw new Error(
        `Failed to remove chat: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get specific message
   */
  getMessage(chatId: string, messageId: string): ExtendedMessage | null {
    const chatMessages = this.messages.get(chatId);
    if (!chatMessages) return null;

    return (
      chatMessages.find((msg: ExtendedMessage) => msg.id === messageId) || null
    );
  }

  /**
   * Get visible messages
   */
  getVisibleMessages(chatId: string): ExtendedMessage[] {
    const chatMessages = this.messages.get(chatId) || [];
    return chatMessages.filter(
      (msg: ExtendedMessage) => !this.hiddenMessages.has(msg.id!),
    );
  }

  /**
   * Get hidden messages
   */
  getHiddenMessages(chatId: string): ExtendedMessage[] {
    const chatMessages = this.messages.get(chatId) || [];
    return chatMessages.filter((msg: ExtendedMessage) =>
      this.hiddenMessages.has(msg.id!),
    );
  }

  /**
   * Get all messages
   */
  getAllMessages(chatId: string): ExtendedMessage[] {
    return this.messages.get(chatId) || [];
  }

  /**
   * Add message
   */
  async addMessage(chatId: string, message: ExtendedMessage): Promise<void> {
    try {
      if (!this.messages.has(chatId)) {
        this.messages.set(chatId, []);
      }

      this.messages.get(chatId)!.push(message);
      this.notifyListeners();
    } catch (error) {
      throw new Error(
        `Failed to add message: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Update message
   */
  async updateMessage(
    chatId: string,
    messageId: string,
    message: ExtendedMessage,
  ): Promise<void> {
    try {
      const chatMessages = this.messages.get(chatId);
      if (!chatMessages) {
        throw new Error(`Chat does not exist: ${chatId}`);
      }

      const messageIndex = chatMessages.findIndex(
        (msg: ExtendedMessage) => msg.id === messageId,
      );
      if (messageIndex === -1) {
        throw new Error(`Message does not exist: ${messageId}`);
      }

      chatMessages[messageIndex] = message;
      this.notifyListeners();
    } catch (error) {
      throw new Error(
        `Failed to update message: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Remove message
   */
  async removeMessage(chatId: string, messageId: string): Promise<void> {
    try {
      const chatMessages = this.messages.get(chatId);
      if (!chatMessages) {
        throw new Error(`Chat does not exist: ${chatId}`);
      }

      const messageIndex = chatMessages.findIndex(
        (msg: ExtendedMessage) => msg.id === messageId,
      );
      if (messageIndex === -1) {
        throw new Error(`Message does not exist: ${messageId}`);
      }

      chatMessages.splice(messageIndex, 1);
      this.hiddenMessages.delete(messageId);

      // Remove from selected messages
      this.selectedMessages = this.selectedMessages.filter(
        (id: string) => id !== messageId,
      );

      this.notifyListeners();
    } catch (error) {
      throw new Error(
        `Failed to remove message: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Check if chat exists
   */
  async chatExists(chatId: string): Promise<boolean> {
    return this.state.chats.has(chatId);
  }

  /**
   * Check if message exists
   */
  async messageExists(messageId: string): Promise<boolean> {
    for (const chatMessages of this.messages.values()) {
      if (chatMessages.some((msg: ExtendedMessage) => msg.id === messageId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Create chat
   */
  async createChat(chat: any): Promise<string> {
    try {
      const chatId = chat.id || this.generateId();
      const chatItem: ChatItem = {
        id: chatId,
        title: chat.title || "New Chat",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        systemPrompt: chat.systemPrompt || "",
        ...chat,
      };

      await this.addChat(chatItem);
      return chatId;
    } catch (error) {
      throw new Error(
        `Failed to create chat: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Delete chat
   */
  async deleteChat(chatId: string): Promise<void> {
    await this.removeChat(chatId);
  }

  /**
   * Delete message
   */
  async deleteMessage(messageId: string): Promise<void> {
    for (const [chatId, messagesList] of this.messages.entries()) {
      const messageIndex = messagesList.findIndex(
        (msg: ExtendedMessage) => msg.id === messageId,
      );
      if (messageIndex !== -1) {
        await this.removeMessage(chatId, messageId);
        return;
      }
    }
    throw new Error(`Message does not exist: ${messageId}`);
  }

  /**
   * Reset state
   */
  async resetState(): Promise<void> {
    try {
      this.state = {
        chats: new Map<string, ChatItem>(),
        currentChatId: null,
        isProcessing: false,
        listeners: new Set<StateListener>(),
        transactions: new Map<string, any>(),
      };
      this.messages.clear();
      this.selectedMessages = [];
      this.hiddenMessages.clear();
      this.metadata = {};
      this.notifyListeners();
    } catch (error) {
      throw new Error(
        `Failed to reset state: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Start transaction
   */
  async beginTransaction(transactionId?: string): Promise<void> {
    const id = transactionId || this.generateId();
    const previousState = {
      chats: new Map(this.state.chats),
      currentChatId: this.state.currentChatId,
      isProcessing: this.state.isProcessing,
      listeners: new Set(this.state.listeners),
      transactions: new Map(this.state.transactions),
    };
    const previousMessages = new Map(this.messages);
    const previousSelectedMessages = [...this.selectedMessages];
    const previousHiddenMessages = new Set(this.hiddenMessages);
    const previousMetadata = { ...this.metadata };

    this.transactionStack.push({
      id,
      previousState,
      previousMessages,
      previousSelectedMessages,
      previousHiddenMessages,
      previousMetadata,
    });
  }

  /**
   * Commit transaction
   */
  async commitTransaction(transactionId?: string): Promise<void> {
    if (this.transactionStack.length === 0) {
      throw new Error("No active transaction");
    }

    if (transactionId) {
      const index = this.transactionStack.findIndex(
        (t) => t.id === transactionId,
      );
      if (index === -1) {
        throw new Error(`Transaction does not exist: ${transactionId}`);
      }
      this.transactionStack.splice(index, 1);
    } else {
      this.transactionStack.pop();
    }
  }

  /**
   * Rollback transaction
   */
  async rollbackTransaction(transactionId?: string): Promise<void> {
    if (this.transactionStack.length === 0) {
      throw new Error("No active transaction");
    }

    let transaction;
    if (transactionId) {
      const index = this.transactionStack.findIndex(
        (t) => t.id === transactionId,
      );
      if (index === -1) {
        throw new Error(`Transaction does not exist: ${transactionId}`);
      }
      transaction = this.transactionStack[index];
      this.transactionStack.splice(index, 1);
    } else {
      transaction = this.transactionStack.pop();
    }

    if (transaction) {
      this.state = transaction.previousState;
      this.messages = transaction.previousMessages;
      this.selectedMessages = transaction.previousSelectedMessages;
      this.hiddenMessages = transaction.previousHiddenMessages;
      this.metadata = transaction.previousMetadata;
      this.notifyListeners();
    }
  }

  /**
   * Validate state
   */
  validateState(): boolean {
    try {
      // Validate basic structure
      if (!this.state || typeof this.state !== "object") {
        return false;
      }

      // Validate required fields
      const requiredFields = [
        "chats",
        "messages",
        "selectedMessages",
        "hiddenMessages",
      ];
      for (const field of requiredFields) {
        if (!(field in this.state)) {
          return false;
        }
      }

      // Validate message reference integrity
      for (const [chatId, messagesList] of this.messages.entries()) {
        if (!this.state.chats.has(chatId)) {
          console.warn(
            `Found orphaned messages, Chat does not exist: ${chatId}`,
          );
        }

        for (const message of messagesList) {
          if (!message.id) {
            console.warn("Found message with no ID");
            return false;
          }
        }
      }

      return true;
    } catch (error) {
      console.error("State validation failed:", error);
      return false;
    }
  }

  /**
   * Initialize
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Validate initial state
      if (!this.validateState()) {
        throw new Error("Initial state validation failed");
      }

      this.initialized = true;
      console.log("StateManager initialized successfully");
    } catch (error) {
      throw new Error(
        `StateManager initialization failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Dispose
   */
  async dispose(): Promise<void> {
    try {
      // Clean up listeners
      this.listeners.clear();

      // Clean up transaction stack
      this.transactionStack = [];

      // Reset state
      await this.resetState();

      this.initialized = false;
      console.log("StateManager has been disposed");
    } catch (error) {
      console.error("StateManager disposal failed:", error);
    }
  }

  /**
   * Deep merge state
   */
  private mergeState(current: ChatState, updates: StateUpdates): ChatState {
    const merged = { ...current };

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        if (
          typeof value === "object" &&
          value !== null &&
          !Array.isArray(value) &&
          !(value instanceof Map) &&
          !(value instanceof Set)
        ) {
          (merged as any)[key] = { ...(merged as any)[key], ...value };
        } else {
          (merged as any)[key] = value;
        }
      }
    }

    return merged;
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(): void {
    const currentState = this.getState();

    for (const listener of this.listeners) {
      try {
        listener(currentState);
      } catch (error) {
        console.error("Listener execution failed:", error);
      }
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
