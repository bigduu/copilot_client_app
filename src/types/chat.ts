export type ToolExecutionStatus = 'pending' | 'approved' | 'rejected' | 'executed';

export type MessageType = 
  | 'normal'           // 普通对话消息
  | 'streaming'        // 流式消息
  | 'system'           // 系统消息
  | 'tool_call'        // 工具调用消息
  | 'tool_result'      // 工具执行结果
  | 'processor_update' // 处理器更新消息
  | 'approval_request' // 等待审批的消息
  | 'error';           // 错误消息

export interface MessageMetadata {
    toolCalls?: any[]; // 工具调用信息
    executionResults?: any[]; // 执行结果
    error?: string; // 错误信息
    timestamp?: number; // 时间戳
    isStreaming?: boolean; // 是否为流式消息
}

export interface Message {
    role: "system" | "user" | "assistant";
    content: string;
    id?: string; // Unique identifier for the message
    messageType?: MessageType; // 消息类型
    processorUpdates?: string[]; // Optional: To store processor update strings
    isToolResult?: boolean; // Optional: To identify tool result messages
    toolExecutionStatus?: Record<string, ToolExecutionStatus>; // Track tool execution status by tool name
    metadata?: MessageMetadata; // 消息元数据
}

export interface ToolApprovalMessages {
    userApproval: Message;
    toolResult: Message;
}

export interface FavoriteItem {
    id: string;
    chatId: string;
    content: string;
    role: "user" | "assistant";
    createdAt: number;
    originalContent?: string; // Original content if this is a selection
    selectionStart?: number;
    selectionEnd?: number;
    note?: string; // Optional note added by user
    messageId?: string; // Reference to the original message id
}

export interface ChatItem {
    id: string;
    title: string;
    messages: Message[];
    createdAt: number;
    systemPrompt?: string; // Optional for backward compatibility
    pinned?: boolean;
    model?: string; // Optional model selection for the chat
}

export interface ChatCompletionResponse {
    choices: Choice[];
    created?: number;
    id?: string;
    usage?: Usage;
    model?: string;
    system_fingerprint?: string;
}

export interface Choice {
    finish_reason: string;
    index?: number;
    content_filter_offsets?: ContentFilterOffsets;
    content_filter_results?: ContentFilterResults;
    delta?: Delta;
    message?: Message;
}

export interface ContentFilterOffsets {
    check_offset: number;
    start_offset: number;
    end_offset: number;
}

export interface Delta {
    content?: any;
    annotations: Annotations;
    copilot_annotations: Annotations;
}

export interface Annotations {
    CodeVulnerability: CodeVulnerability[];
}

export interface CodeVulnerability {
    id: number;
    start_offset: number;
    end_offset: number;
    details: Details;
    citations: Citations;
}

export interface Citations {
    // Empty in Rust
}

export interface Details {
    type: string;
}

export interface ContentFilterResults {
    error: Error;
    hate: FilterResult;
    self_harm: FilterResult;
    sexual: FilterResult;
    violence: FilterResult;
}

export interface Error {
    code: string;
    message: string;
}

export interface FilterResult {
    filtered: boolean;
    severity: string;
}

export interface Usage {
    completion_tokens: number;
    prompt_tokens: number;
    total_tokens: number;
}

export interface SystemPromptPreset {
    id: string; // uuid
    name: string;
    content: string;
}

export type SystemPromptPresetList = SystemPromptPreset[];
