import { 
  ChatManager, 
  StateManager, 
  ChatFlowController, 
  AttachmentProcessor, 
  ApprovalManager,
  ErrorHandler,
  PerformanceMonitor 
} from '../interfaces/chat-manager';
import {
  OperationResult,
  CreateChatOptions,
  UpdateChatOptions,
  CreateMessageOptions,
  UpdateMessageOptions,
  BatchResult,
  TransactionResult,
  DeleteResult,
  Operation,
  TransactionOperation,
  ChatState,
  ExtendedMessage,
  ApprovalConfig,
  AttachmentRequest,
  MessageFlow,
  ApprovalFlow,
  ApprovalAction,
  Attachment
} from '../types/unified-chat';

/**
 * Unified Chat Manager - Core Implementation Class
 * Centralizes all chat operations and provides a unified API interface
 */
export class UnifiedChatManager implements ChatManager {
  public stateManager: StateManager;
  public flowController: ChatFlowController;
  public attachmentProcessor: AttachmentProcessor;
  public approvalManager: ApprovalManager;
  public errorHandler: ErrorHandler;
  public performanceMonitor: PerformanceMonitor;
  
  private initialized = false;
  private subscribers = new Set<(state: ChatState) => void>();
  
  // Add missing properties to satisfy the ChatManager interface
  public persistenceLayer: any; // Temporarily use any, will implement a specific type later

  constructor(
    stateManager: StateManager,
    flowController: ChatFlowController,
    attachmentProcessor: AttachmentProcessor,
    approvalManager: ApprovalManager,
    errorHandler: ErrorHandler,
    performanceMonitor: PerformanceMonitor,
    persistenceLayer?: any
  ) {
    this.stateManager = stateManager;
    this.flowController = flowController;
    this.attachmentProcessor = attachmentProcessor;
    this.approvalManager = approvalManager;
    this.errorHandler = errorHandler;
    this.performanceMonitor = performanceMonitor;
    this.persistenceLayer = persistenceLayer;
  }

  // ========== Initialization and Lifecycle ==========
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize each component
      await this.stateManager.initialize();
      await this.flowController.initialize();
      await this.attachmentProcessor.initialize();
      await this.approvalManager.initialize();
      await this.errorHandler.initialize();
      await this.performanceMonitor.initialize();

      // Set up event listeners
      this.setupEventListeners();
      
      this.initialized = true;
    } catch (error) {
      throw new Error(`ChatManager initialization failed: ${error}`);
    }
  }

  async dispose(): Promise<void> {
    if (!this.initialized) return;

    // Clean up resources
    await this.stateManager.dispose();
    await this.flowController.dispose();
    await this.attachmentProcessor.dispose();
    await this.approvalManager.dispose();
    await this.errorHandler.dispose();
    await this.performanceMonitor.dispose();

    this.subscribers.clear();
    this.initialized = false;
  }

  // ========== Atomic Operation Interface ==========
  async addChat(options: CreateChatOptions): Promise<OperationResult<string>> {
    const startTime = performance.now();
    
    try {
      // Validate input
      if (!options.title?.trim()) {
        return this.errorHandler.createErrorResult('Chat title cannot be empty');
      }

      // Execute creation operation
      const chatId = await this.stateManager.createChat({
        ...options,
        id: crypto.randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: []
      });

      // Trigger state update
      await this.notifyStateChange();

      // Record performance
      this.performanceMonitor.recordOperation('addChat', performance.now() - startTime);

      return {
        success: true,
        data: chatId,
        message: 'Chat created successfully'
      };
    } catch (error) {
      return this.errorHandler.handleError(error, 'addChat');
    }
  }

  async updateChat(chatId: string, options: UpdateChatOptions): Promise<OperationResult<void>> {
    const startTime = performance.now();
    
    try {
      // Get existing chat
      const existingChat = this.stateManager.getChat(chatId);
      if (!existingChat) {
        return this.errorHandler.createErrorResult('Chat does not exist');
      }

      // Create updated chat object
      const updatedChat = {
        ...existingChat,
        ...options
      };

      // Execute update operation
      await this.stateManager.updateChat(chatId, updatedChat);

      await this.notifyStateChange();
      this.performanceMonitor.recordOperation('updateChat', performance.now() - startTime);

      return {
        success: true,
        message: 'Chat updated successfully'
      };
    } catch (error) {
      return this.errorHandler.handleError(error, 'updateChat');
    }
  }

  async deleteChat(chatId: string): Promise<DeleteResult> {
    const startTime = performance.now();
    
    try {
      const exists = await this.stateManager.chatExists(chatId);
      if (!exists) {
        return {
          success: false,
          deletedId: chatId,
          message: 'Chat does not exist'
        };
      }

      await this.stateManager.deleteChat(chatId);
      await this.notifyStateChange();
      this.performanceMonitor.recordOperation('deleteChat', performance.now() - startTime);

      return {
        success: true,
        deletedId: chatId,
        message: 'Chat deleted successfully'
      };
    } catch (error) {
      return {
        success: false,
        deletedId: chatId,
        message: `Failed to delete chat: ${error}`
      };
    }
  }

  async addMessage(chatId: string, options: CreateMessageOptions): Promise<OperationResult<string>> {
    const startTime = performance.now();
    
    try {
      // Check if chat exists
      const exists = await this.stateManager.chatExists(chatId);
      if (!exists) {
        return this.errorHandler.createErrorResult('Chat does not exist');
      }

      // Process attachments (if any)
      if (options.attachments?.length) {
        const attachmentResult = await this.attachmentProcessor.processAttachments(options.attachments);
        if (!attachmentResult.success) {
          return {
            success: false,
            error: attachmentResult.error,
            errorCode: attachmentResult.errorCode
          };
        }
        options.processedAttachments = attachmentResult.data;
      }

      // Create message
      const messageId = crypto.randomUUID();
      const message: ExtendedMessage = {
        id: messageId,
        content: options.content,
        role: options.role,
        timestamp: new Date(),
        createdAt: new Date().toISOString(),
        attachments: options.processedAttachments,
        isHidden: options.isHidden || false,
        metadata: options.metadata
      };

      await this.stateManager.addMessage(chatId, message);

      // If approval is required and the message is not hidden
      if (options.requiresApproval && !options.isHidden) {
        await this.approvalManager.requestApproval(messageId, options.approvalConfig);
      }

      await this.notifyStateChange();
      this.performanceMonitor.recordOperation('addMessage', performance.now() - startTime);

      return {
        success: true,
        data: messageId,
        message: 'Message added successfully'
      };
    } catch (error) {
      return this.errorHandler.handleError(error, 'addMessage');
    }
  }

  async updateMessage(messageId: string, options: UpdateMessageOptions): Promise<OperationResult<void>> {
    const startTime = performance.now();
    
    try {
      const exists = await this.stateManager.messageExists(messageId);
      if (!exists) {
        return this.errorHandler.createErrorResult('Message does not exist');
      }

      // Need to get the chatId of the message first
      const message = await this.stateManager.getMessage('', messageId);
      if (!message || !message.chatId) {
        return this.errorHandler.createErrorResult('Cannot find message or message is missing chatId');
      }
      
      await this.stateManager.updateMessage(message.chatId, messageId, {
        ...message,
        ...options,
        updatedAt: new Date()
      });

      await this.notifyStateChange();
      this.performanceMonitor.recordOperation('updateMessage', performance.now() - startTime);

      return {
        success: true,
        message: 'Message updated successfully'
      };
    } catch (error) {
      return this.errorHandler.handleError(error, 'updateMessage');
    }
  }

  async deleteMessage(messageId: string): Promise<DeleteResult> {
    const startTime = performance.now();
    
    try {
      const exists = await this.stateManager.messageExists(messageId);
      if (!exists) {
        return {
          success: false,
          deletedId: messageId,
          message: 'Message does not exist'
        };
      }

      await this.stateManager.deleteMessage(messageId);
      await this.notifyStateChange();
      this.performanceMonitor.recordOperation('deleteMessage', performance.now() - startTime);

      return {
        success: true,
        deletedId: messageId,
        message: 'Message deleted successfully'
      };
    } catch (error) {
      return {
        success: false,
        deletedId: messageId,
        message: `Failed to delete message: ${error}`
      };
    }
  }

  // ========== Batch Operations ==========
  async batchOperation(operations: Operation[]): Promise<BatchResult> {
    const startTime = performance.now();
    const results: OperationResult<any>[] = [];
    let successCount = 0;
    let failureCount = 0;

    try {
      for (const operation of operations) {
        let result: OperationResult<any>;

        switch (operation.type) {
          case 'addChat':
            result = await this.addChat(operation.options);
            break;
          case 'updateChat':
            result = await this.updateChat(operation.chatId!, operation.options);
            break;
          case 'deleteChat':
            result = await this.deleteChat(operation.chatId!);
            break;
          case 'addMessage':
            result = await this.addMessage(operation.chatId!, operation.options);
            break;
          case 'updateMessage':
            result = await this.updateMessage(operation.messageId!, operation.options);
            break;
          case 'deleteMessage':
            result = await this.deleteMessage(operation.messageId!);
            break;
          default:
            result = this.errorHandler.createErrorResult('Unsupported operation type');
        }

        results.push(result);
        if (result.success) {
          successCount++;
        } else {
          failureCount++;
        }
      }

      this.performanceMonitor.recordOperation('batchOperation', performance.now() - startTime);

      return {
        success: failureCount === 0,
        results,
        successCount,
        failureCount,
        message: `Batch operation completed: ${successCount} successful, ${failureCount} failed`
      };
    } catch (error) {
      return {
        success: false,
        results,
        successCount,
        failureCount,
        message: `Batch operation failed: ${error}`
      };
    }
  }

  async transactionOperations(operations: TransactionOperation[]): Promise<TransactionResult> {
    const startTime = performance.now();
    
    try {
      // Begin transaction
      await this.stateManager.beginTransaction();
      
      const results: OperationResult<any>[] = [];
      
      for (const operation of operations) {
        const result = await this.executeTransactionOperation(operation);
        results.push(result);
        
        if (!result.success) {
          // Rollback transaction
          await this.stateManager.rollbackTransaction();
          return {
            success: false,
            results,
            rolledBack: true,
            message: 'Transaction failed and has been rolled back'
          };
        }
      }
      
      // Commit transaction
      await this.stateManager.commitTransaction();
      await this.notifyStateChange();
      
      this.performanceMonitor.recordOperation('transactionOperations', performance.now() - startTime);
      
      return {
        success: true,
        results,
        rolledBack: false,
        message: 'Transaction executed successfully'
      };
    } catch (error) {
      await this.stateManager.rollbackTransaction();
      return {
        success: false,
        results: [],
        rolledBack: true,
        message: `Transaction exception: ${error}`
      };
    }
  }

  // ========== Transactional Operations ==========
  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    try {
      await this.stateManager.beginTransaction();
      const result = await operation();
      await this.stateManager.commitTransaction();
      await this.notifyStateChange();
      return result;
    } catch (error) {
      await this.stateManager.rollbackTransaction();
      throw error;
    }
  }

  // ========== State Management ==========
  getState(): ChatState {
    return this.stateManager.getState();
  }

  subscribe(callback: (state: ChatState) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  async resetState(): Promise<void> {
    await this.stateManager.resetState();
    await this.notifyStateChange();
  }

  // ========== Flow Control ==========
  async startChatFlow(chatId: string, flowType: string): Promise<OperationResult<void>> {
    return this.flowController.startFlow(chatId, flowType);
  }

  async pauseChatFlow(chatId: string): Promise<OperationResult<void>> {
    return this.flowController.pauseFlow(chatId);
  }

  async resumeChatFlow(chatId: string): Promise<OperationResult<void>> {
    return this.flowController.resumeFlow(chatId);
  }

  async stopChatFlow(chatId: string): Promise<OperationResult<void>> {
    return this.flowController.stopFlow(chatId);
  }

  // ========== Attachment Processing ==========
  async processAttachment(request: AttachmentRequest): Promise<OperationResult<any>> {
    return this.attachmentProcessor.processAttachment(request);
  }

  async getAttachmentResult(attachmentId: string): Promise<OperationResult<any>> {
    return this.attachmentProcessor.getResult(attachmentId);
  }

  // ========== Approval Management ==========
  async configureApproval(config: ApprovalConfig): Promise<OperationResult<void>> {
    return this.approvalManager.configure(config);
  }

  async approveOperation(operationId: string): Promise<OperationResult<void>> {
    return this.approvalManager.approve(operationId);
  }

  async rejectOperation(operationId: string, reason?: string): Promise<OperationResult<void>> {
    return this.approvalManager.reject(operationId, reason);
  }

  // ========== Performance Monitoring ==========
  getPerformanceMetrics() {
    return this.performanceMonitor.getMetrics();
  }

  // ========== Private Methods ==========
  private async executeTransactionOperation(operation: TransactionOperation): Promise<OperationResult<any>> {
    switch (operation.type) {
      case 'addChat':
        return this.addChat(operation.options);
      case 'updateChat':
        return this.updateChat(operation.chatId!, operation.options);
      case 'deleteChat':
        return this.deleteChat(operation.chatId!);
      case 'addMessage':
        return this.addMessage(operation.chatId!, operation.options);
      case 'updateMessage':
        return this.updateMessage(operation.messageId!, operation.options);
      case 'deleteMessage':
        return this.deleteMessage(operation.messageId!);
      default:
        return this.errorHandler.createErrorResult('Unsupported transaction operation type');
    }
  }

  private setupEventListeners(): void {
    // Listen for changes from the state manager
    this.stateManager.subscribe((state) => {
      this.notifySubscribers(state);
    });

    // Listen for flow controller events
    this.flowController.subscribe((event) => {
      // Handle flow events
      this.handleFlowEvent(event);
    });

    // Listen for approval manager events
    this.approvalManager.subscribe((event) => {
      // Handle approval events
      this.handleApprovalEvent(event);
    });
  }

  private async notifyStateChange(): Promise<void> {
    const state = this.stateManager.getState();
    this.notifySubscribers(state);
  }

  private notifySubscribers(state: ChatState): void {
    this.subscribers.forEach((callback) => {
      try {
        callback(state);
      } catch (error) {
        console.error('Subscriber callback execution failed:', error);
      }
    });
  }

  private async handleFlowEvent(event: any): Promise<void> {
    // Handle flow control events
    console.log('Flow event:', event);
  }

  private async handleApprovalEvent(event: any): Promise<void> {
    // Handle approval events
    console.log('Approval event:', event);
  }

  // ========== Add missing ChatManager interface methods ==========
  async sendMessageWithAttachments(chatId: string, content: string, attachments: Attachment[]): Promise<MessageFlow> {
    try {
      // Create message options
      const messageOptions: CreateMessageOptions = {
        content,
        role: 'user',
        attachments
      };

      // Add message
      const result = await this.addMessage(chatId, messageOptions);
      
      if (!result.success) {
        return {
          messageId: '',
          chatId,
          status: 'error',
          message: {
            id: '',
            content,
            role: 'user',
            timestamp: new Date(),
            createdAt: new Date().toISOString(),
            chatId,
            attachments: []
          }
        };
      }

      return {
        messageId: result.data!,
        chatId,
        status: 'sent',
        message: {
          id: result.data!,
          content,
          role: 'user',
          timestamp: new Date(),
          createdAt: new Date().toISOString(),
          chatId,
          attachments: []
        }
      };
    } catch (error) {
      throw new Error(`Failed to send message with attachments: ${error}`);
    }
  }

  async handleApprovalFlow(_chatId: string, action: ApprovalAction): Promise<OperationResult<ApprovalFlow>> {
    try {
      // Construct ApprovalConfig based on the action type
      const config: ApprovalConfig = {
        autoApprove: action.automatic || action.action === 'approve',
        approvalMessage: action.reason,
        approvalTimeout: 30000, // 30-second timeout
      };

      const messageId = action.messageId || '';
      await this.approvalManager.requestApproval(messageId, config);
      
      // Construct ApprovalFlow for return
      const flow: ApprovalFlow = {
        approved: action.action === 'approve',
        automatic: action.automatic || false,
        timestamp: Date.now(),
        details: action.metadata
      };

      return {
        success: true,
        data: flow
      };
    } catch (error) {
      return this.errorHandler.createErrorResult(`Approval flow processing failed: ${error}`);
    }
  }

  getCurrentChat(): any | null {
    const state = this.stateManager.getState();
    if (!state.currentChatId) return null;
    return state.chats.get(state.currentChatId) || null;
  }

  getCurrentMessages(): ExtendedMessage[] {
    const currentChat = this.getCurrentChat();
    if (!currentChat) return [];
    return currentChat.messages || [];
  }

  isProcessing(): boolean {
    return this.stateManager.getState().isProcessing;
  }
}
