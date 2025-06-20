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
 * 统一聊天管理器 - 核心实现类
 * 集中管理所有聊天操作，提供统一的API接口
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
  
  // 添加缺失的属性以满足ChatManager接口
  public persistenceLayer: any; // 暂时使用any，后续实现具体类型

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

  // ========== 初始化和生命周期 ==========
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // 初始化各个组件
      await this.stateManager.initialize();
      await this.flowController.initialize();
      await this.attachmentProcessor.initialize();
      await this.approvalManager.initialize();
      await this.errorHandler.initialize();
      await this.performanceMonitor.initialize();

      // 设置事件监听
      this.setupEventListeners();
      
      this.initialized = true;
    } catch (error) {
      throw new Error(`ChatManager初始化失败: ${error}`);
    }
  }

  async dispose(): Promise<void> {
    if (!this.initialized) return;

    // 清理资源
    await this.stateManager.dispose();
    await this.flowController.dispose();
    await this.attachmentProcessor.dispose();
    await this.approvalManager.dispose();
    await this.errorHandler.dispose();
    await this.performanceMonitor.dispose();

    this.subscribers.clear();
    this.initialized = false;
  }

  // ========== 原子操作接口 ==========
  async addChat(options: CreateChatOptions): Promise<OperationResult<string>> {
    const startTime = performance.now();
    
    try {
      // 验证输入
      if (!options.title?.trim()) {
        return this.errorHandler.createErrorResult('聊天标题不能为空');
      }

      // 执行创建操作
      const chatId = await this.stateManager.createChat({
        ...options,
        id: crypto.randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: []
      });

      // 触发状态更新
      await this.notifyStateChange();

      // 记录性能
      this.performanceMonitor.recordOperation('addChat', performance.now() - startTime);

      return {
        success: true,
        data: chatId,
        message: '聊天创建成功'
      };
    } catch (error) {
      return this.errorHandler.handleError(error, 'addChat');
    }
  }

  async updateChat(chatId: string, options: UpdateChatOptions): Promise<OperationResult<void>> {
    const startTime = performance.now();
    
    try {
      // 获取现有聊天
      const existingChat = this.stateManager.getChat(chatId);
      if (!existingChat) {
        return this.errorHandler.createErrorResult('聊天不存在');
      }

      // 创建更新后的聊天对象
      const updatedChat = {
        ...existingChat,
        ...options
      };

      // 执行更新操作
      await this.stateManager.updateChat(chatId, updatedChat);

      await this.notifyStateChange();
      this.performanceMonitor.recordOperation('updateChat', performance.now() - startTime);

      return {
        success: true,
        message: '聊天更新成功'
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
          message: '聊天不存在'
        };
      }

      await this.stateManager.deleteChat(chatId);
      await this.notifyStateChange();
      this.performanceMonitor.recordOperation('deleteChat', performance.now() - startTime);

      return {
        success: true,
        deletedId: chatId,
        message: '聊天删除成功'
      };
    } catch (error) {
      return {
        success: false,
        deletedId: chatId,
        message: `聊天删除失败: ${error}`
      };
    }
  }

  async addMessage(chatId: string, options: CreateMessageOptions): Promise<OperationResult<string>> {
    const startTime = performance.now();
    
    try {
      // 检查聊天是否存在
      const exists = await this.stateManager.chatExists(chatId);
      if (!exists) {
        return this.errorHandler.createErrorResult('聊天不存在');
      }

      // 处理附件（如果有）
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

      // 创建消息
      const messageId = crypto.randomUUID();
      const message: ExtendedMessage = {
        id: messageId,
        content: options.content,
        role: options.role,
        timestamp: new Date(),
        createdAt: new Date(),
        attachments: options.processedAttachments,
        isHidden: options.isHidden || false,
        metadata: options.metadata
      };

      await this.stateManager.addMessage(chatId, message);

      // 如果需要审批且不是隐藏消息
      if (options.requiresApproval && !options.isHidden) {
        await this.approvalManager.requestApproval(messageId, options.approvalConfig);
      }

      await this.notifyStateChange();
      this.performanceMonitor.recordOperation('addMessage', performance.now() - startTime);

      return {
        success: true,
        data: messageId,
        message: '消息添加成功'
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
        return this.errorHandler.createErrorResult('消息不存在');
      }

      // 需要先获取消息所属的chatId
      const message = await this.stateManager.getMessage('', messageId);
      if (!message || !message.chatId) {
        return this.errorHandler.createErrorResult('无法找到消息或消息缺少chatId');
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
        message: '消息更新成功'
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
          message: '消息不存在'
        };
      }

      await this.stateManager.deleteMessage(messageId);
      await this.notifyStateChange();
      this.performanceMonitor.recordOperation('deleteMessage', performance.now() - startTime);

      return {
        success: true,
        deletedId: messageId,
        message: '消息删除成功'
      };
    } catch (error) {
      return {
        success: false,
        deletedId: messageId,
        message: `消息删除失败: ${error}`
      };
    }
  }

  // ========== 批量操作 ==========
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
            result = this.errorHandler.createErrorResult('不支持的操作类型');
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
        message: `批量操作完成: 成功${successCount}个，失败${failureCount}个`
      };
    } catch (error) {
      return {
        success: false,
        results,
        successCount,
        failureCount,
        message: `批量操作失败: ${error}`
      };
    }
  }

  async transactionOperations(operations: TransactionOperation[]): Promise<TransactionResult> {
    const startTime = performance.now();
    
    try {
      // 开始事务
      await this.stateManager.beginTransaction();
      
      const results: OperationResult<any>[] = [];
      
      for (const operation of operations) {
        const result = await this.executeTransactionOperation(operation);
        results.push(result);
        
        if (!result.success) {
          // 回滚事务
          await this.stateManager.rollbackTransaction();
          return {
            success: false,
            results,
            rolledBack: true,
            message: '事务执行失败，已回滚'
          };
        }
      }
      
      // 提交事务
      await this.stateManager.commitTransaction();
      await this.notifyStateChange();
      
      this.performanceMonitor.recordOperation('transactionOperations', performance.now() - startTime);
      
      return {
        success: true,
        results,
        rolledBack: false,
        message: '事务执行成功'
      };
    } catch (error) {
      await this.stateManager.rollbackTransaction();
      return {
        success: false,
        results: [],
        rolledBack: true,
        message: `事务执行异常: ${error}`
      };
    }
  }

  // ========== 事务操作 ==========
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

  // ========== 状态管理 ==========
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

  // ========== 流程控制 ==========
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

  // ========== 附件处理 ==========
  async processAttachment(request: AttachmentRequest): Promise<OperationResult<any>> {
    return this.attachmentProcessor.processAttachment(request);
  }

  async getAttachmentResult(attachmentId: string): Promise<OperationResult<any>> {
    return this.attachmentProcessor.getResult(attachmentId);
  }

  // ========== 审批管理 ==========
  async configureApproval(config: ApprovalConfig): Promise<OperationResult<void>> {
    return this.approvalManager.configure(config);
  }

  async approveOperation(operationId: string): Promise<OperationResult<void>> {
    return this.approvalManager.approve(operationId);
  }

  async rejectOperation(operationId: string, reason?: string): Promise<OperationResult<void>> {
    return this.approvalManager.reject(operationId, reason);
  }

  // ========== 性能监控 ==========
  getPerformanceMetrics() {
    return this.performanceMonitor.getMetrics();
  }

  // ========== 私有方法 ==========
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
        return this.errorHandler.createErrorResult('不支持的事务操作类型');
    }
  }

  private setupEventListeners(): void {
    // 监听状态管理器的变化
    this.stateManager.subscribe((state) => {
      this.notifySubscribers(state);
    });

    // 监听流程控制器事件
    this.flowController.subscribe((event) => {
      // 处理流程事件
      this.handleFlowEvent(event);
    });

    // 监听审批管理器事件
    this.approvalManager.subscribe((event) => {
      // 处理审批事件
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
        console.error('订阅者回调执行失败:', error);
      }
    });
  }

  private async handleFlowEvent(event: any): Promise<void> {
    // 处理流程控制事件
    console.log('流程事件:', event);
  }

  private async handleApprovalEvent(event: any): Promise<void> {
    // 处理审批事件
    console.log('审批事件:', event);
  }

  // ========== 添加缺失的ChatManager接口方法 ==========
  async sendMessageWithAttachments(chatId: string, content: string, attachments: Attachment[]): Promise<MessageFlow> {
    try {
      // 创建消息选项
      const messageOptions: CreateMessageOptions = {
        content,
        role: 'user',
        attachments
      };

      // 添加消息
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
          chatId,
          attachments: []
        }
      };
    } catch (error) {
      throw new Error(`发送带附件消息失败: ${error}`);
    }
  }

  async handleApprovalFlow(_chatId: string, action: ApprovalAction): Promise<OperationResult<ApprovalFlow>> {
    try {
      // 根据操作类型构造ApprovalConfig
      const config: ApprovalConfig = {
        autoApprove: action.automatic || action.action === 'approve',
        approvalMessage: action.reason,
        approvalTimeout: 30000, // 30秒超时
      };

      const messageId = action.messageId || '';
      await this.approvalManager.requestApproval(messageId, config);
      
      // 构造ApprovalFlow返回
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
      return this.errorHandler.createErrorResult(`审批流程处理失败: ${error}`);
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