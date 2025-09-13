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

// Atomic Operations Interface
export interface AtomicOperations {
  // Chat Operations
  addChat(options: CreateChatOptions): Promise<OperationResult<string>>;
  updateChat(chatId: string, updates: UpdateChatOptions): Promise<OperationResult<void>>;
  deleteChat(chatId: string): Promise<DeleteResult>;

  // Message Operations
  addMessage(chatId: string, options: CreateMessageOptions): Promise<OperationResult<string>>;
  updateMessage(messageId: string, updates: UpdateMessageOptions): Promise<OperationResult<void>>;
  deleteMessage(messageId: string): Promise<DeleteResult>;

  // Batch Operations
  batchOperation(operations: Operation[]): Promise<BatchResult>;
  transactionOperations(operations: TransactionOperation[]): Promise<TransactionResult>;
}

// Chat Flow Controller Interface
export interface ChatFlowController {
  initiateChat(options: CreateChatOptions): Promise<ChatFlow>;
  sendMessage(chatId: string, content: string): Promise<MessageFlow>;
  sendMessageWithAttachments(chatId: string, content: string, attachments: Attachment[]): Promise<MessageFlow>;
  handleToolCall(chatId: string, toolCall: any): Promise<ToolFlow>;
  processAIResponse(chatId: string, messages: Message[]): Promise<AIFlow>;
  handleApprovalFlow(chatId: string, action: ApprovalAction): Promise<ApprovalFlow>;
  
  // Flow Control Methods
  startFlow(chatId: string, flowType: string): Promise<OperationResult<void>>;
  pauseFlow(chatId: string): Promise<OperationResult<void>>;
  resumeFlow(chatId: string): Promise<OperationResult<void>>;
  stopFlow(chatId: string): Promise<OperationResult<void>>;
  subscribe(callback: (event: any) => void): () => void;
  
  // Lifecycle
  initialize(): Promise<void>;
  dispose(): Promise<void>;
}

// State Manager Interface
export interface StateManager {
  getState(): ChatState;
  updateState(updates: StateUpdates): void;
  subscribe(listener: StateListener): Unsubscribe;
  
  // Chat-related
  getChat(chatId: string): ChatItem | null;
  getAllChats(): ChatItem[];
  addChat(chat: ChatItem): Promise<void>;
  updateChat(chatId: string, chat: ChatItem): Promise<void>;
  removeChat(chatId: string): Promise<void>;
  
  // Message-related
  getMessage(chatId: string, messageId: string): ExtendedMessage | null;
  getVisibleMessages(chatId: string): ExtendedMessage[];
  getHiddenMessages(chatId: string): ExtendedMessage[];
  getAllMessages(chatId: string): ExtendedMessage[];
  addMessage(chatId: string, message: ExtendedMessage): Promise<void>;
  updateMessage(chatId: string, messageId: string, message: ExtendedMessage): Promise<void>;
  removeMessage(chatId: string, messageId: string): Promise<void>;
  
  // Convenience Methods
  chatExists(chatId: string): Promise<boolean>;
  messageExists(messageId: string): Promise<boolean>;
  createChat(chat: any): Promise<string>;
  deleteChat(chatId: string): Promise<void>;
  deleteMessage(messageId: string): Promise<void>;
  resetState(): Promise<void>;
  
  // Transaction Management
  beginTransaction(transactionId?: string): Promise<void>;
  commitTransaction(transactionId?: string): Promise<void>;
  rollbackTransaction(transactionId?: string): Promise<void>;
  
  // State Validation
  validateState(): boolean;
  
  // Lifecycle
  initialize(): Promise<void>;
  dispose(): Promise<void>;
}

// Attachment Processor Interface
export interface AttachmentProcessor {
  processAttachments(attachments: Attachment[]): Promise<OperationResult<AttachmentResult[]>>;
  processAttachment(request: AttachmentRequest): Promise<OperationResult<AttachmentResult>>;
  getResult(attachmentId: string): Promise<OperationResult<any>>;
  mergeAttachmentSummaries(content: string, results: AttachmentResult[]): string;
  generateAttachmentPrompt(attachment: Attachment): string;
  
  // Lifecycle
  initialize(): Promise<void>;
  dispose(): Promise<void>;
}

// Approval Manager Interface
export interface ApprovalManager {
  requestApproval(messageId: string, config?: ApprovalConfig): Promise<OperationResult<void>>;
  configure(config: ApprovalConfig): Promise<OperationResult<void>>;
  approve(operationId: string): Promise<OperationResult<void>>;
  reject(operationId: string, reason?: string): Promise<OperationResult<void>>;
  subscribe(callback: (event: any) => void): () => void;
  
  // Lifecycle
  initialize(): Promise<void>;
  dispose(): Promise<void>;
}

// Error Handler Interface
export interface ErrorHandler {
  processError(error: Error): Promise<never>;
  retryWithBackoff(operation: () => Promise<any>, maxRetries?: number): Promise<any>;
  rollbackAndNotify(error: Error): Promise<never>;
  enrichError(error: Error): Error;
  createErrorResult(message: string): OperationResult<any>;
  handleError(error: any, operation: string): OperationResult<any>;
  
  // Lifecycle
  initialize(): Promise<void>;
  dispose(): Promise<void>;
}

// Persistence Layer Interface
export interface PersistenceLayer {
  saveChat(chat: ChatItem): Promise<void>;
  loadChats(): Promise<ChatItem[]>;
  saveMessage(chatId: string, message: ExtendedMessage): Promise<void>;
  loadMessages(chatId: string): Promise<ExtendedMessage[]>;
  deleteChat(chatId: string): Promise<void>;
  deleteMessage(chatId: string, messageId: string): Promise<void>;
}

// Main ChatManager interface
export interface ChatManager extends AtomicOperations {
  // Core Components
  flowController: ChatFlowController;
  stateManager: StateManager;
  attachmentProcessor: AttachmentProcessor;
  approvalManager: ApprovalManager;
  errorHandler: ErrorHandler;
  persistenceLayer: PersistenceLayer;

  // Advanced Operations
  sendMessageWithAttachments(chatId: string, content: string, attachments: Attachment[]): Promise<MessageFlow>;
  handleApprovalFlow(chatId: string, action: ApprovalAction): Promise<OperationResult<ApprovalFlow>>;
  
  // State Query
  getCurrentChat(): ChatItem | null;
  getCurrentMessages(): ExtendedMessage[];
  isProcessing(): boolean;
  
  // Transaction Operations
  transaction<T>(operation: () => Promise<T>): Promise<T>;
  transactionOperations(operations: TransactionOperation[]): Promise<TransactionResult>;
  
  // Lifecycle
  initialize(): Promise<void>;
  dispose(): Promise<void>;
}
