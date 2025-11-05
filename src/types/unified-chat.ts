import { ChatItem, Message } from "./chat";

// Unified result type
export interface OperationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
  message?: string;
}

// Chat operation options
export interface CreateChatOptions {
  title?: string;
  systemPrompt?: string;
  systemPromptId?: string;
  toolCategory?: string;
  model?: string;
  initialMessage?: string;
  autoApproval?: boolean; // Auto-approval setting
}

// Update chat options
export interface UpdateChatOptions {
  title?: string;
  systemPrompt?: string;
  model?: string;
  toolCategory?: string;
  pinned?: boolean;
  autoApproval?: boolean;
}

// Create message options
export interface CreateMessageOptions {
  content: string;
  role: "user" | "assistant" | "system";
  attachments?: Attachment[];
  processedAttachments?: AttachmentResult[];
  isHidden?: boolean;
  metadata?: MessageMetadata;
  requiresApproval?: boolean;
  approvalConfig?: ApprovalConfig;
}

// Update message options
export interface UpdateMessageOptions {
  content?: string;
  role?: "system" | "user" | "assistant";
  processorUpdates?: string[];
  isHidden?: boolean;
  attachmentSummary?: string;
  attachments?: AttachmentResult[];
  metadata?: MessageMetadata;
  updatedAt?: Date;
}

// Approval configuration
export interface ApprovalConfig {
  autoApprove: boolean;
  approvalTimeout?: number;
  approvalMessage?: string;
  requiredApprovers?: string[];
}

// Attachment request
export interface AttachmentRequest {
  type: "image" | "file" | "url";
  content: string | File | Blob;
  metadata?: Record<string, any>;
}

// Chat session
export interface ChatSession {
  chatId: string;
  isActive: boolean;
  startedAt: Date;
  lastActivity: Date;
  flowType?: string;
  flowState?: string;
}

// State update types
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
  role?: "system" | "user" | "assistant";
  processorUpdates?: string[];
  isHidden?: boolean;
  attachmentSummary?: string;
}

// Extended message type
export type ExtendedMessage = Message & {
  isHidden?: boolean; // Controls whether the message is displayed in the GUI
  messageType?:
    | "normal"
    | "attachment_processing"
    | "approval_request"
    | "approval_response";
  attachmentSummary?: string; // Attachment processing result
  parentMessageId?: string; // Association
  metadata?: MessageMetadata; // Metadata
  timestamp: Date; // Compatible with existing code
  createdAt: string; // Creation time
  updatedAt?: Date; // Update time
  chatId?: string; // ID of the chat it belongs to
  attachments?: AttachmentResult[]; // List of attachments
};

// Message Metadata
export interface MessageMetadata {
  attachments?: Attachment[];
  approvalRequired?: boolean;
  autoApproved?: boolean;
  processingSteps?: ProcessingStep[];
}

// Attachment type
export interface Attachment {
  id: string;
  type: "image" | "file" | "screenshot";
  url: string;
  name: string;
  size: number;
  mimeType: string;
}

// Image Attachment type (specifically for images in chat messages)
export interface ImageAttachment extends Attachment {
  type: "image";
  base64: string; // Base64 encoded image data
  width?: number;
  height?: number;
  preview?: string; // Preview URL for display
}

// Processing step
export interface ProcessingStep {
  id: string;
  step: string;
  status: "pending" | "processing" | "completed" | "failed";
  timestamp: number;
  details?: any;
}

// Approval action type
export interface ApprovalAction {
  id: string;
  type: "tool_execution" | "file_operation" | "system_change";
  description: string;
  details: any;
  riskLevel: "low" | "medium" | "high";
}

// Approval action type
export interface ApprovalAction {
  action: "approve" | "reject" | "request";
  messageId?: string;
  reason?: string;
  automatic?: boolean;
  metadata?: any;
}

// Flow control result
export interface ChatFlow {
  chatId: string;
  status: "created" | "ready" | "error";
  chat: ChatItem;
}

export interface MessageFlow {
  messageId: string;
  chatId: string;
  status: "sent" | "processing" | "completed" | "error";
  message: ExtendedMessage;
}

export interface StreamResult {
  messageId: string;
  chatId: string;
  status: "streaming" | "completed" | "error";
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

// Batch operation type
export interface Operation {
  type:
    | "addChat"
    | "updateChat"
    | "deleteChat"
    | "addMessage"
    | "updateMessage"
    | "deleteMessage";
  chatId?: string;
  messageId?: string;
  data: any;
  options?: any; // Operation options
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
  options?: any; // Transaction operation options
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

// State management types
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

// Delete result type
export interface DeleteResult {
  success: boolean;
  deletedId: string;
  affectedChats?: string[];
  message?: string;
}

// Tool flow result
export interface ToolFlow {
  toolId: string;
  status: "pending" | "approved" | "rejected" | "completed" | "error";
  result?: any;
  error?: string;
}

// AI flow result
export interface AIFlow {
  responseId: string;
  status: "generating" | "completed" | "error";
  content: string;
  processingTime: number;
}
