import { StateValue } from "xstate";

// --- Agent Role System Types ---

/**
 * Agent role defines the permissions and behavior of the agent.
 * - Planner: Read-only analysis and planning
 * - Actor: Full permissions for execution
 */
export type AgentRole = "planner" | "actor";

/**
 * Message type defines how the message should be rendered and processed.
 */
export type MessageType =
  | "text"
  | "plan"
  | "question"
  | "tool_call"
  | "tool_result";

/**
 * Structured plan message format from Planner role
 */
export interface PlanMessage {
  goal: string;
  steps: PlanStep[];
  estimated_total_time: string;
  risks: string[];
  prerequisites?: string[];
}

export interface PlanStep {
  step_number: number;
  action: string;
  reason: string;
  tools_needed: string[];
  estimated_time: string;
}

/**
 * Structured question message format from Actor role
 */
export interface QuestionMessage {
  type: "question";
  question: string;
  context: string;
  severity: "critical" | "major" | "minor";
  options: QuestionOption[];
  default?: string;
  allow_custom?: boolean;
}

export interface QuestionOption {
  label: string;
  value: string;
  description: string;
}

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

// Defines how the tool's output should be displayed in the UI.
export type DisplayPreference = "Default" | "Collapsible" | "Hidden";

// Represents the structured result from a tool execution.
export interface ToolExecutionResult {
  tool_name: string;
  result: string;
  display_preference: DisplayPreference;
}

// Type guard to check if an object is a ToolExecutionResult
export const isToolExecutionResult = (obj: any): obj is ToolExecutionResult => {
  return (
    obj &&
    typeof obj.result === "string" &&
    typeof obj.display_preference === "string"
  );
};

export type ExecutionStatus = "success" | "error" | "warning";

// --- NEW V3 DATA STRUCTURES ---

// Base interface for all message types
interface BaseMessage {
  id: string;
  createdAt: string;
}

// 1. User's Message
export interface SystemMessage extends BaseMessage {
  role: "system";
  content: string;
}

export interface UserMessage extends BaseMessage {
  role: "user";
  content: string;
  images?: MessageImage[];
}

// User's File Reference Message
export interface UserFileReferenceMessage extends BaseMessage {
  role: "user";
  type: "file_reference";
  paths: string[]; // ✅ 改为数组，支持多文件/文件夹
  displayText: string;
}

// 2. Assistant's Standard Text Response
export interface AssistantTextMessage extends BaseMessage {
  role: "assistant";
  type: "text";
  content: string;
  // --- Metadata ---
  model?: string;
  finishReason?: "stop" | "length" | "error";
  tokenUsage?: { promptTokens: number; completionTokens: number };
  latency?: { firstTokenMs: number; totalDurationMs: number };
  metadata?: {
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
    // Agent continuation metadata
    should_continue?: boolean;
    continue_reason?: string;
    continuation_count?: number;
    [key: string]: any;
  };
}

// 3. Assistant's Request to Call a Tool
export interface AssistantToolCallMessage extends BaseMessage {
  role: "assistant";
  type: "tool_call";
  toolCalls: {
    toolCallId: string;
    toolName: string;
    parameters: Record<string, any>;
  }[]; // Support for multiple tool calls in one turn
  // --- Metadata ---
  model?: string;
  finishReason?: "tool_calls";
  // ... other metadata
}

// 4. Assistant's Report of a Tool's Result
export interface AssistantToolResultMessage extends BaseMessage {
  role: "assistant";
  type: "tool_result";
  toolName: string;
  toolCallId: string; // Links back to the specific call request.
  result: ToolExecutionResult;
  isError: boolean;
}

export interface WorkflowResultMessage extends BaseMessage {
  role: "assistant";
  type: "workflow_result";
  workflowName: string;
  parameters?: Record<string, unknown> | string | null;
  status?: ExecutionStatus;
  content: string;
}

export interface AssistantTodoListMessage extends BaseMessage {
  role: "assistant";
  type: "todo_list";
  todoList: import("./todoList").TodoListMsg;
}

// The complete, type-safe Message union
export type Message =
  | UserMessage
  | UserFileReferenceMessage
  | AssistantTextMessage
  | AssistantToolCallMessage
  | AssistantToolResultMessage
  | AssistantTodoListMessage
  | WorkflowResultMessage
  | SystemMessage;

// --- NEW ChatItem V2 ---

export interface ChatItem {
  id: string;
  title: string;
  createdAt: number;
  pinned?: boolean;

  // The full conversation history
  messages: Message[];

  // The configuration for this chat
  config: {
    // The base system prompt ID from the library
    systemPromptId: string;
    // The original, un-enhanced system prompt content
    baseSystemPrompt: string;
    // The actual, enhanced prompt content used in the last interaction
    lastUsedEnhancedPrompt: string | null;
    // The agent's current role (planner or actor)
    agentRole?: AgentRole;
    // Workspace root path for @ file references
    workspacePath?: string;
  };

  // The state of the CURRENT, ONGOING interaction.
  // This is null if the chat is idle.
  currentInteraction: {
    // The state machine's current position (e.g., 'generatingResponse.streaming')
    machineState: StateValue;

    // The ID of the assistant message being streamed into
    streamingMessageId: string | null;

    // The content being actively streamed
    streamingContent: string | null;

    // A tool call that is pending user approval
    pendingApproval?: {
      toolCallId: string;
      toolName: string;
      parameters: Record<string, any>;
    };

    // An error that occurred during the last operation
    error?: {
      message: string;
      details?: any;
    };
  } | null;
}

// --- Utility functions and Type Guards ---

export const isAssistantToolResultMessage = (
  message: Message
): message is AssistantToolResultMessage => {
  return (
    message.role === "assistant" &&
    "type" in message &&
    message.type === "tool_result"
  );
};

export const isAssistantToolCallMessage = (
  message: Message
): message is AssistantToolCallMessage => {
  return (
    message.role === "assistant" &&
    "type" in message &&
    message.type === "tool_call"
  );
};

export const isWorkflowResultMessage = (
  message: Message
): message is WorkflowResultMessage => {
  return (
    message.role === "assistant" &&
    "type" in message &&
    message.type === "workflow_result"
  );
};

export const isUserFileReferenceMessage = (
  message: Message
): message is UserFileReferenceMessage => {
  return (
    message.role === "user" &&
    "type" in message &&
    message.type === "file_reference"
  );
};

export const isTodoListMessage = (
  message: Message
): message is AssistantTodoListMessage => {
  return (
    message.role === "assistant" &&
    "type" in message &&
    message.type === "todo_list"
  );
};

// --- Other existing types to keep ---

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

// Note: The following types are for raw API responses and are kept for that purpose.
// The 'message' property in 'Choice' might need future adjustment if it conflicts.
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
  delta?: { content?: string };
  message?: { role: "assistant"; content: string | null; tool_calls?: any[] };
}

export interface Usage {
  completion_tokens: number;
  prompt_tokens: number;
  total_tokens: number;
}

export interface UserSystemPrompt {
  id: string; // UUID
  name: string;
  description?: string;
  content: string;
  isDefault?: boolean; // To mark built-in prompts
}
