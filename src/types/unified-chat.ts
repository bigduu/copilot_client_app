import { ChatItem, Message } from './chat';

// 统一的结果类型
export interface OperationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
  message?: string;
}

// 聊天操作选项
export interface CreateChatOptions {
  title?: string;
  systemPrompt?: string;
  systemPromptId?: string;
  toolCategory?: string;
  model?: string;
  initialMessage?: string;
  autoApproval?: boolean; // 自动审批设置
}

// 更新聊天选项
export interface UpdateChatOptions {
  title?: string;
  systemPrompt?: string;
  model?: string;
  toolCategory?: string;
  pinned?: boolean;
  autoApproval?: boolean;
}

// 创建消息选项
export interface CreateMessageOptions {
  content: string;
  role: 'user' | 'assistant' | 'system';
  attachments?: Attachment[];
  processedAttachments?: AttachmentResult[];
  isHidden?: boolean;
  metadata?: MessageMetadata;
  requiresApproval?: boolean;
  approvalConfig?: ApprovalConfig;
}

// 更新消息选项
export interface UpdateMessageOptions {
  content?: string;
  role?: 'system' | 'user' | 'assistant';
  processorUpdates?: string[];
  isHidden?: boolean;
  attachmentSummary?: string;
  attachments?: AttachmentResult[];
  metadata?: MessageMetadata;
  updatedAt?: Date;
}

// 审批配置
export interface ApprovalConfig {
  autoApprove: boolean;
  approvalTimeout?: number;
  approvalMessage?: string;
  requiredApprovers?: string[];
}

// 附件请求
export interface AttachmentRequest {
  type: 'image' | 'file' | 'url';
  content: string | File | Blob;
  metadata?: Record<string, any>;
}

// 聊天会话
export interface ChatSession {
  chatId: string;
  isActive: boolean;
  startedAt: Date;
  lastActivity: Date;
  flowType?: string;
  flowState?: string;
}

// 状态更新类型
export interface ChatUpdates {
  title?: string;
  systemPrompt?: string;
  model?: string;
  toolCategory?: string;
  pinned?: boolean;
  autoApproval?: boolean;
}

export interface MessageUpdates {
  content?: string;
  role?: 'system' | 'user' | 'assistant';
  processorUpdates?: string[];
  isHidden?: boolean;
  attachmentSummary?: string;
}

// 扩展的消息类型
export interface ExtendedMessage extends Message {
  isHidden?: boolean; // 控制消息是否在GUI中显示
  messageType?: 'normal' | 'attachment_processing' | 'approval_request' | 'approval_response';
  attachmentSummary?: string; // 附件处理结果
  parentMessageId?: string; // 关联关系
  metadata?: MessageMetadata; // 元数据
  timestamp: Date; // 兼容现有代码
  createdAt?: Date; // 创建时间
  updatedAt?: Date; // 更新时间
  chatId?: string; // 所属聊天ID
  attachments?: AttachmentResult[]; // 附件列表
}

// 消息元数据
export interface MessageMetadata {
  attachments?: Attachment[];
  approvalRequired?: boolean;
  autoApproved?: boolean;
  processingSteps?: ProcessingStep[];
}

// 附件类型
export interface Attachment {
  id: string;
  type: 'image' | 'file' | 'screenshot';
  url: string;
  name: string;
  size: number;
  mimeType: string;
}

// 处理步骤
export interface ProcessingStep {
  id: string;
  step: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  timestamp: number;
  details?: any;
}

// 审批动作类型
export interface ApprovalAction {
  id: string;
  type: 'tool_execution' | 'file_operation' | 'system_change';
  description: string;
  details: any;
  riskLevel: 'low' | 'medium' | 'high';
}

// 流程控制结果
export interface ChatFlow {
  chatId: string;
  status: 'created' | 'ready' | 'error';
  chat: ChatItem;
}

export interface MessageFlow {
  messageId: string;
  chatId: string;
  status: 'sent' | 'processing' | 'completed' | 'error';
  message: ExtendedMessage;
}

export interface StreamResult {
  messageId: string;
  chatId: string;
  status: 'streaming' | 'completed' | 'error';
  content: string;
}

export interface AttachmentResult {
  attachment: Attachment;
  summary: string;
  originalContent: string;
  processingTime: number;
}

export interface ApprovalFlow {
  approved: boolean;
  automatic: boolean;
  timestamp: number;
  details?: any;
}

// 审批操作类型
export interface ApprovalAction {
  action: 'approve' | 'reject' | 'request';
  messageId?: string;
  reason?: string;
  automatic?: boolean;
  metadata?: any;
}

// 批量操作类型
export interface Operation {
  type: 'addChat' | 'updateChat' | 'deleteChat' | 'addMessage' | 'updateMessage' | 'deleteMessage';
  chatId?: string;
  messageId?: string;
  data: any;
  options?: any; // 操作选项
}

export interface BatchResult {
  success: boolean;
  results: OperationResult<any>[];
  successCount: number;
  failureCount: number;
  message: string;
  failedOperations?: Operation[];
}

export interface TransactionOperation extends Operation {
  rollback?: () => Promise<void>;
  options?: any; // 事务操作选项
}

export interface TransactionResult {
  success: boolean;
  operationsCompleted?: number;
  rollbackExecuted?: boolean;
  rolledBack: boolean;
  results: OperationResult<any>[];
  message: string;
  error?: string;
}

// 状态管理类型
export interface ChatState {
  chats: Map<string, ChatItem>;
  currentChatId: string | null;
  isProcessing: boolean;
  listeners: Set<StateListener>;
  transactions: Map<string, Transaction>;
}

export interface StateUpdates {
  chats?: ChatItem[];
  currentChatId?: string | null;
  isProcessing?: boolean;
}

export interface Transaction {
  id: string;
  snapshot: ChatState;
  timestamp: number;
}

export type StateListener = (state: ChatState) => void;
export type Unsubscribe = () => void;

// 删除结果类型
export interface DeleteResult {
  success: boolean;
  deletedId: string;
  affectedChats?: string[];
  message?: string;
}

// 工具流程结果
export interface ToolFlow {
  toolId: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'error';
  result?: any;
  error?: string;
}

// AI流程结果
export interface AIFlow {
  responseId: string;
  status: 'generating' | 'completed' | 'error';
  content: string;
  processingTime: number;
}