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

// Remove hardcoded tool category enum, changed to dynamic retrieval from backend
// These constants are only for backward compatibility, should be obtained from backend API in actual applications
export const TOOL_CATEGORIES = {
  GENERAL: "general_assistant", // General assistant
  FILE_READER: "file_operations", // File operations (including reading)
  FILE_CREATOR: "file_operations", // File operations (including creation)
  FILE_DELETER: "file_operations", // File operations (including deletion)
  COMMAND_EXECUTOR: "command_execution", // Command execution
  FILE_UPDATER: "file_operations", // File operations (including updates)
  FILE_SEARCHER: "file_operations", // File operations (including search)
} as const;

// 工具类别接口，与后端保持一致
export interface ToolCategoryInfo {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  tools: string[];
  restrict_conversation: boolean;
  enabled: boolean;
  auto_prefix?: string;
  icon?: string;
  color?: string;
  strict_tools_mode: boolean;
}
