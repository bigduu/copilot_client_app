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
  systemPromptId?: string; // New: Associated system prompt ID
  toolCategory?: string; // New: Tool category
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
  description: string; // New: Capability description
  category: string; // New: Tool category - changed to string type, obtained from backend
  mode: "general" | "tool_specific"; // New: Mode type
  autoToolPrefix?: string; // New: Auto tool prefix (e.g., "/read_file")
  allowedTools?: string[]; // New: List of allowed tools (whitelist)
  restrictConversation?: boolean; // New: Whether to restrict normal conversation
}

export type SystemPromptPresetList = SystemPromptPreset[];

// 注意：硬编码的 TOOL_CATEGORIES 枚举已被移除
// 现在所有类别信息都从后端动态获取
// ToolCategoryInfo 接口已移至 src/types/toolCategory.ts
