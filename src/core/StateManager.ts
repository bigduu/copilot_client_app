import {
  StateManager as IStateManager,
} from '../interfaces/chat-manager';
import {
  ChatState,
  StateUpdates,
  StateListener,
  Unsubscribe,
  ExtendedMessage,
  // OperationResult
} from '../types/unified-chat';
import { ChatItem } from '../types/chat';

/**
 * 统一状态管理器
 * 集中管理所有聊天状态，提供状态变更通知
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
      transactions: new Map<string, any>()
    };
  }

  /**
   * 获取当前状态
   */
  getState(): ChatState {
    return { ...this.state };
  }

  /**
   * 更新状态并通知监听器
   */
  updateState(updates: StateUpdates): void {
    try {
      // 深度合并状态更新
      this.state = this.mergeState(this.state, updates);
      
      // 通知所有监听器
      this.notifyListeners();
    } catch (error) {
      console.error('状态更新失败:', error);
      throw new Error(`状态更新失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 订阅状态变更
   */
  subscribe(listener: StateListener): Unsubscribe {
    this.listeners.add(listener);
    
    // 立即发送当前状态
    try {
      listener(this.getState());
    } catch (error) {
      console.error('监听器执行失败:', error);
    }

    // 返回取消订阅函数
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 获取指定聊天
   */
  getChat(chatId: string): ChatItem | null {
    return this.state.chats.get(chatId) || null;
  }

  /**
   * 获取所有聊天
   */
  getAllChats(): ChatItem[] {
    return Array.from(this.state.chats.values());
  }

  /**
   * 添加聊天
   */
  async addChat(chat: ChatItem): Promise<void> {
    try {
      this.state.chats.set(chat.id, chat);
      this.notifyListeners();
    } catch (error) {
      throw new Error(`添加聊天失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 更新聊天
   */
  async updateChat(chatId: string, chat: ChatItem): Promise<void> {
    try {
      if (!this.state.chats.has(chatId)) {
        throw new Error(`聊天不存在: ${chatId}`);
      }
      
      this.state.chats.set(chatId, chat);
      this.notifyListeners();
    } catch (error) {
      throw new Error(`更新聊天失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 移除聊天
   */
  async removeChat(chatId: string): Promise<void> {
    try {
      if (!this.state.chats.has(chatId)) {
        throw new Error(`聊天不存在: ${chatId}`);
      }

      // 删除聊天及其所有消息
      this.state.chats.delete(chatId);
      this.messages.delete(chatId);
      
      // 如果是当前聊天，重置当前聊天ID
      if (this.state.currentChatId === chatId) {
        this.state.currentChatId = null;
      }

      this.notifyListeners();
    } catch (error) {
      throw new Error(`移除聊天失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取指定消息
   */
  getMessage(chatId: string, messageId: string): ExtendedMessage | null {
    const chatMessages = this.messages.get(chatId);
    if (!chatMessages) return null;
    
    return chatMessages.find((msg: ExtendedMessage) => msg.id === messageId) || null;
  }

  /**
   * 获取可见消息
   */
  getVisibleMessages(chatId: string): ExtendedMessage[] {
    const chatMessages = this.messages.get(chatId) || [];
    return chatMessages.filter((msg: ExtendedMessage) => !this.hiddenMessages.has(msg.id!));
  }

  /**
   * 获取隐藏消息
   */
  getHiddenMessages(chatId: string): ExtendedMessage[] {
    const chatMessages = this.messages.get(chatId) || [];
    return chatMessages.filter((msg: ExtendedMessage) => this.hiddenMessages.has(msg.id!));
  }

  /**
   * 获取所有消息
   */
  getAllMessages(chatId: string): ExtendedMessage[] {
    return this.messages.get(chatId) || [];
  }

  /**
   * 添加消息
   */
  async addMessage(chatId: string, message: ExtendedMessage): Promise<void> {
    try {
      if (!this.messages.has(chatId)) {
        this.messages.set(chatId, []);
      }
      
      this.messages.get(chatId)!.push(message);
      this.notifyListeners();
    } catch (error) {
      throw new Error(`添加消息失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 更新消息
   */
  async updateMessage(chatId: string, messageId: string, message: ExtendedMessage): Promise<void> {
    try {
      const chatMessages = this.messages.get(chatId);
      if (!chatMessages) {
        throw new Error(`聊天不存在: ${chatId}`);
      }

      const messageIndex = chatMessages.findIndex((msg: ExtendedMessage) => msg.id === messageId);
      if (messageIndex === -1) {
        throw new Error(`消息不存在: ${messageId}`);
      }

      chatMessages[messageIndex] = message;
      this.notifyListeners();
    } catch (error) {
      throw new Error(`更新消息失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 移除消息
   */
  async removeMessage(chatId: string, messageId: string): Promise<void> {
    try {
      const chatMessages = this.messages.get(chatId);
      if (!chatMessages) {
        throw new Error(`聊天不存在: ${chatId}`);
      }

      const messageIndex = chatMessages.findIndex((msg: ExtendedMessage) => msg.id === messageId);
      if (messageIndex === -1) {
        throw new Error(`消息不存在: ${messageId}`);
      }

      chatMessages.splice(messageIndex, 1);
      this.hiddenMessages.delete(messageId);
      
      // 从选中消息中移除
      this.selectedMessages = this.selectedMessages.filter((id: string) => id !== messageId);
      
      this.notifyListeners();
    } catch (error) {
      throw new Error(`移除消息失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 检查聊天是否存在
   */
  async chatExists(chatId: string): Promise<boolean> {
    return this.state.chats.has(chatId);
  }

  /**
   * 检查消息是否存在
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
   * 创建聊天
   */
  async createChat(chat: any): Promise<string> {
    try {
      const chatId = chat.id || this.generateId();
      const chatItem: ChatItem = {
        id: chatId,
        title: chat.title || '新聊天',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        systemPrompt: chat.systemPrompt || '',
        ...chat
      };

      await this.addChat(chatItem);
      return chatId;
    } catch (error) {
      throw new Error(`创建聊天失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 删除聊天
   */
  async deleteChat(chatId: string): Promise<void> {
    await this.removeChat(chatId);
  }

  /**
   * 删除消息
   */
  async deleteMessage(messageId: string): Promise<void> {
    for (const [chatId, messagesList] of this.messages.entries()) {
      const messageIndex = messagesList.findIndex((msg: ExtendedMessage) => msg.id === messageId);
      if (messageIndex !== -1) {
        await this.removeMessage(chatId, messageId);
        return;
      }
    }
    throw new Error(`消息不存在: ${messageId}`);
  }

  /**
   * 重置状态
   */
  async resetState(): Promise<void> {
    try {
      this.state = {
        chats: new Map<string, ChatItem>(),
        currentChatId: null,
        isProcessing: false,
        listeners: new Set<StateListener>(),
        transactions: new Map<string, any>()
      };
      this.messages.clear();
      this.selectedMessages = [];
      this.hiddenMessages.clear();
      this.metadata = {};
      this.notifyListeners();
    } catch (error) {
      throw new Error(`重置状态失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 开始事务
   */
  async beginTransaction(transactionId?: string): Promise<void> {
    const id = transactionId || this.generateId();
    const previousState = {
      chats: new Map(this.state.chats),
      currentChatId: this.state.currentChatId,
      isProcessing: this.state.isProcessing,
      listeners: new Set(this.state.listeners),
      transactions: new Map(this.state.transactions)
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
      previousMetadata
    });
  }

  /**
   * 提交事务
   */
  async commitTransaction(transactionId?: string): Promise<void> {
    if (this.transactionStack.length === 0) {
      throw new Error('没有活跃的事务');
    }

    if (transactionId) {
      const index = this.transactionStack.findIndex(t => t.id === transactionId);
      if (index === -1) {
        throw new Error(`事务不存在: ${transactionId}`);
      }
      this.transactionStack.splice(index, 1);
    } else {
      this.transactionStack.pop();
    }
  }

  /**
   * 回滚事务
   */
  async rollbackTransaction(transactionId?: string): Promise<void> {
    if (this.transactionStack.length === 0) {
      throw new Error('没有活跃的事务');
    }

    let transaction;
    if (transactionId) {
      const index = this.transactionStack.findIndex(t => t.id === transactionId);
      if (index === -1) {
        throw new Error(`事务不存在: ${transactionId}`);
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
   * 验证状态
   */
  validateState(): boolean {
    try {
      // 验证基本结构
      if (!this.state || typeof this.state !== 'object') {
        return false;
      }

      // 验证必需字段
      const requiredFields = ['chats', 'messages', 'selectedMessages', 'hiddenMessages'];
      for (const field of requiredFields) {
        if (!(field in this.state)) {
          return false;
        }
      }

      // 验证消息引用完整性
      for (const [chatId, messagesList] of this.messages.entries()) {
        if (!this.state.chats.has(chatId)) {
          console.warn(`发现孤立消息，聊天不存在: ${chatId}`);
        }
        
        for (const message of messagesList) {
          if (!message.id) {
            console.warn('发现没有ID的消息');
            return false;
          }
        }
      }

      return true;
    } catch (error) {
      console.error('状态验证失败:', error);
      return false;
    }
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // 验证初始状态
      if (!this.validateState()) {
        throw new Error('初始状态验证失败');
      }

      this.initialized = true;
      console.log('StateManager 初始化完成');
    } catch (error) {
      throw new Error(`StateManager 初始化失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 销毁
   */
  async dispose(): Promise<void> {
    try {
      // 清理监听器
      this.listeners.clear();
      
      // 清理事务栈
      this.transactionStack = [];
      
      // 重置状态
      await this.resetState();
      
      this.initialized = false;
      console.log('StateManager 已销毁');
    } catch (error) {
      console.error('StateManager 销毁失败:', error);
    }
  }

  /**
   * 深度合并状态
   */
  private mergeState(current: ChatState, updates: StateUpdates): ChatState {
    const merged = { ...current };

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Map) && !(value instanceof Set)) {
          (merged as any)[key] = { ...(merged as any)[key], ...value };
        } else {
          (merged as any)[key] = value;
        }
      }
    }

    return merged;
  }

  /**
   * 通知所有监听器
   */
  private notifyListeners(): void {
    const currentState = this.getState();
    
    for (const listener of this.listeners) {
      try {
        listener(currentState);
      } catch (error) {
        console.error('监听器执行失败:', error);
      }
    }
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}