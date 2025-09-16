// Image attachment interface for messages
export interface MessageImage {
  id: string;
  base64: string; // Base64 encoded image data with data URL prefix
  name: string;
  size: number;
  type: string; // MIME type
  width?: number;
  height?: number;
}

export interface ProcessorUpdate {
  type: "processor_update";
  source: string;
  content: string;
}

export interface MessageContentPart {
  type: "text" | "image_url" | "tool_code";
  text?: string;
  image_url?: {
    url: string;
    detail?: "low" | "high" | "auto";
  };
  tool_code?: string;
}

// Defines how the tool's output should be displayed in the UI.
export type DisplayPreference = "Default" | "Collapsible" | "Hidden";

// Represents the structured result from a tool execution.
export interface ToolExecutionResult {
  result: string;
  display_preference: DisplayPreference;
}

// Content can be a string, an array of parts, or a structured tool result.
export type MessageContent = string | MessageContentPart[] | ToolExecutionResult;

export interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: MessageContent;
  createdAt: string;
  images?: MessageImage[];
  processorUpdates?: ProcessorUpdate[];
  isStreaming?: boolean; // Flag for streaming messages
}

// Type guard to check if content is a ToolExecutionResult
export const isToolExecutionResult = (content: MessageContent): content is ToolExecutionResult => {
  return typeof content === 'object' && content !== null && 'result' in content && 'display_preference' in content;
};

// Utility functions for message content handling
export const getMessageText = (content: MessageContent): string => {
  if (typeof content === 'string') {
    return content;
  }

  if (isToolExecutionResult(content)) {
    // For tool results, the "text" is the raw result string.
    return content.result;
  }

  // Extract text from array format for rich content (e.g., with images)
  const textParts = content
    .filter(part => part.type === 'text' && part.text)
    .map(part => part.text!)
    .join(' ');

  return textParts;
};

export const createTextContent = (text: string): MessageContent => text;

export const createContentWithImages = (text: string, images: MessageImage[]): MessageContent => {
  const content: MessageContent = [
    {
      type: "text",
      text: text
    }
  ];

  // Add images to content array
  images.forEach(image => {
    (content as any[]).push({
      type: "image_url",
      image_url: {
        url: image.base64,
        detail: "high"
      }
    });
  });

  return content;
};

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

// Note: The hardcoded TOOL_CATEGORIES enum has been removed
// All category information is now dynamically fetched from the backend
// The ToolCategoryInfo interface has been moved to src/types/toolCategory.ts
