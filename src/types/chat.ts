export interface Message {
    role: "system" | "user" | "assistant";
    content: string;
    id?: string; // Unique identifier for the message
    processorUpdates?: string[]; // Optional: To store processor update strings
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
    systemPromptId?: string;       // 新增：关联的系统提示ID
    toolCategory?: string;         // 新增：工具类别
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
    description: string;           // 新增：能力描述
    category: string;              // 新增：工具类别
    mode: 'general' | 'tool_specific'; // 新增：模式类型
    autoToolPrefix?: string;       // 新增：自动工具前缀 (如: "/read_file")
    allowedTools?: string[];       // 新增：允许的工具列表（白名单）
    restrictConversation?: boolean; // 新增：是否限制普通对话
}

export type SystemPromptPresetList = SystemPromptPreset[];

// 工具类别枚举
export enum ToolCategory {
    GENERAL = 'general',           // 通用助手
    FILE_READER = 'file_reader',   // 文件读取专家
    FILE_CREATOR = 'file_creator', // 文件创建专家
    FILE_DELETER = 'file_deleter', // 文件删除专家
    COMMAND_EXECUTOR = 'command_execution', // 命令执行专家
    FILE_UPDATER = 'file_updater', // 文件更新专家
    FILE_SEARCHER = 'file_searcher' // 文件搜索专家
}
