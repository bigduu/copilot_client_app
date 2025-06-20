import {
  OperationResult,
  CreateChatOptions,
  UpdateChatOptions,
  CreateMessageOptions,
  UpdateMessageOptions,
  ExtendedMessage,
  ChatFlow,
  MessageFlow,
  AttachmentResult,
  ApprovalFlow,
  DeleteResult,
  BatchResult,
  TransactionResult,
  ChatState,
  StateUpdates,
  StateListener,
  Unsubscribe,
  Operation,
  TransactionOperation,
  Attachment,
  AttachmentRequest,
  ApprovalAction,
  ApprovalConfig,
  ToolFlow,
  AIFlow
} from '../types/unified-chat';
import { ChatItem, Message } from '../types/chat';

// 原子操作接口
export interface AtomicOperations {
  // 聊天操作
  addChat(options: CreateChatOptions): Promise<OperationResult<string>>;
  updateChat(chatId: string, updates: UpdateChatOptions): Promise<OperationResult<void>>;
  deleteChat(chatId: string): Promise<DeleteResult>;

  // 消息操作
  addMessage(chatId: string, options: CreateMessageOptions): Promise<OperationResult<string>>;
  updateMessage(messageId: string, updates: UpdateMessageOptions): Promise<OperationResult<void>>;
  deleteMessage(messageId: string): Promise<DeleteResult>;

  // 批量操作
  batchOperation(operations: Operation[]): Promise<BatchResult>;
  transactionOperations(operations: TransactionOperation[]): Promise<TransactionResult>;
}

// 流程控制器接口
export interface ChatFlowController {
  initiateChat(options: CreateChatOptions): Promise<ChatFlow>;
  sendMessage(chatId: string, content: string): Promise<MessageFlow>;
  sendMessageWithAttachments(chatId: string, content: string, attachments: Attachment[]): Promise<MessageFlow>;
  handleToolCall(chatId: string, toolCall: any): Promise<ToolFlow>;
  processAIResponse(chatId: string, messages: Message[]): Promise<AIFlow>;
  handleApprovalFlow(chatId: string, action: ApprovalAction): Promise<ApprovalFlow>;
  
  // 流程控制方法
  startFlow(chatId: string, flowType: string): Promise<OperationResult<void>>;
  pauseFlow(chatId: string): Promise<OperationResult<void>>;
  resumeFlow(chatId: string): Promise<OperationResult<void>>;
  stopFlow(chatId: string): Promise<OperationResult<void>>;
  subscribe(callback: (event: any) => void): () => void;
  
  // 生命周期
  initialize(): Promise<void>;
  dispose(): Promise<void>;
}

// 状态管理器接口
export interface StateManager {
  getState(): ChatState;
  updateState(updates: StateUpdates): void;
  subscribe(listener: StateListener): Unsubscribe;
  
  // 聊天相关
  getChat(chatId: string): ChatItem | null;
  getAllChats(): ChatItem[];
  addChat(chat: ChatItem): Promise<void>;
  updateChat(chatId: string, chat: ChatItem): Promise<void>;
  removeChat(chatId: string): Promise<void>;
  
  // 消息相关
  getMessage(chatId: string, messageId: string): ExtendedMessage | null;
  getVisibleMessages(chatId: string): ExtendedMessage[];
  getHiddenMessages(chatId: string): ExtendedMessage[];
  getAllMessages(chatId: string): ExtendedMessage[];
  addMessage(chatId: string, message: ExtendedMessage): Promise<void>;
  updateMessage(chatId: string, messageId: string, message: ExtendedMessage): Promise<void>;
  removeMessage(chatId: string, messageId: string): Promise<void>;
  
  // 便利方法
  chatExists(chatId: string): Promise<boolean>;
  messageExists(messageId: string): Promise<boolean>;
  createChat(chat: any): Promise<string>;
  deleteChat(chatId: string): Promise<void>;
  deleteMessage(messageId: string): Promise<void>;
  resetState(): Promise<void>;
  
  // 事务管理
  beginTransaction(transactionId?: string): Promise<void>;
  commitTransaction(transactionId?: string): Promise<void>;
  rollbackTransaction(transactionId?: string): Promise<void>;
  
  // 状态验证
  validateState(): boolean;
  
  // 生命周期
  initialize(): Promise<void>;
  dispose(): Promise<void>;
}

// 附件处理器接口
export interface AttachmentProcessor {
  processAttachments(attachments: Attachment[]): Promise<OperationResult<AttachmentResult[]>>;
  processAttachment(request: AttachmentRequest): Promise<OperationResult<AttachmentResult>>;
  getResult(attachmentId: string): Promise<OperationResult<any>>;
  mergeAttachmentSummaries(content: string, results: AttachmentResult[]): string;
  generateAttachmentPrompt(attachment: Attachment): string;
  
  // 生命周期
  initialize(): Promise<void>;
  dispose(): Promise<void>;
}

// 审批管理器接口
export interface ApprovalManager {
  requestApproval(messageId: string, config?: ApprovalConfig): Promise<OperationResult<void>>;
  configure(config: ApprovalConfig): Promise<OperationResult<void>>;
  approve(operationId: string): Promise<OperationResult<void>>;
  reject(operationId: string, reason?: string): Promise<OperationResult<void>>;
  subscribe(callback: (event: any) => void): () => void;
  
  // 生命周期
  initialize(): Promise<void>;
  dispose(): Promise<void>;
}

// 错误处理器接口
export interface ErrorHandler {
  processError(error: Error): Promise<never>;
  retryWithBackoff(operation: () => Promise<any>, maxRetries?: number): Promise<any>;
  rollbackAndNotify(error: Error): Promise<never>;
  enrichError(error: Error): Error;
  createErrorResult(message: string): OperationResult<any>;
  handleError(error: any, operation: string): OperationResult<any>;
  
  // 生命周期
  initialize(): Promise<void>;
  dispose(): Promise<void>;
}

// 持久化层接口
export interface PersistenceLayer {
  saveChat(chat: ChatItem): Promise<void>;
  loadChats(): Promise<ChatItem[]>;
  saveMessage(chatId: string, message: ExtendedMessage): Promise<void>;
  loadMessages(chatId: string): Promise<ExtendedMessage[]>;
  deleteChat(chatId: string): Promise<void>;
  deleteMessage(chatId: string, messageId: string): Promise<void>;
}

// 性能监控接口
export interface PerformanceMonitor {
  trackOperation(operationName: string, duration: number): void;
  withTracking<T>(operationName: string, operation: () => Promise<T>): Promise<T>;
  recordOperation(operation: string, duration: number): void;
  getMetrics(): Record<string, any>;
  
  // 生命周期
  initialize(): Promise<void>;
  dispose(): Promise<void>;
}

// 主要的ChatManager接口
export interface ChatManager extends AtomicOperations {
  // 核心组件
  flowController: ChatFlowController;
  stateManager: StateManager;
  attachmentProcessor: AttachmentProcessor;
  approvalManager: ApprovalManager;
  errorHandler: ErrorHandler;
  persistenceLayer: PersistenceLayer;
  performanceMonitor: PerformanceMonitor;

  // 高级操作
  sendMessageWithAttachments(chatId: string, content: string, attachments: Attachment[]): Promise<MessageFlow>;
  handleApprovalFlow(chatId: string, action: ApprovalAction): Promise<OperationResult<ApprovalFlow>>;
  
  // 状态查询
  getCurrentChat(): ChatItem | null;
  getCurrentMessages(): ExtendedMessage[];
  isProcessing(): boolean;
  
  // 事务操作
  transaction<T>(operation: () => Promise<T>): Promise<T>;
  transactionOperations(operations: TransactionOperation[]): Promise<TransactionResult>;
  
  // 生命周期
  initialize(): Promise<void>;
  dispose(): Promise<void>;
}