/**
 * SSE (Server-Sent Events) Types for Signal-Pull Architecture
 *
 * The backend sends lightweight metadata events via SSE, and the frontend
 * pulls actual content via REST API when needed.
 */

/**
 * Union type for all SSE events from the backend
 */
export type SignalEvent =
  | StateChangedEvent
  | MessageCreatedEvent
  | ContentDeltaEvent
  | MessageCompletedEvent
  | TitleUpdatedEvent
  | TodoListUpdatedEvent
  | HeartbeatEvent
  | AgentContinueEvent
  | ContinuationLimitReachedEvent;

/**
 * Agent requested continuation of the current task
 */
export interface AgentContinueEvent {
  type: "agent_continue";
  session_id: string;
  reason: string;
}

/**
 * Maximum number of automatic continuations reached
 */
export interface ContinuationLimitReachedEvent {
  type: "continuation_limit_reached";
  count: number;
  reasons: string[];
}

/**
 * Context state has changed (e.g., Idle → StreamingLLMResponse)
 */
export interface StateChangedEvent {
  type: "state_changed";
  context_id: string;
  new_state: string;
  timestamp: string;
}

/**
 * New message created (signal only, frontend should pull message details via REST)
 */
export interface MessageCreatedEvent {
  type: "message_created";
  message_id: string;
  role: string;
}

/**
 * Message content has new chunks available (metadata only, no text)
 * Frontend should pull content via REST API
 */
export interface ContentDeltaEvent {
  type: "content_delta";
  context_id: string;
  message_id: string;
  current_sequence: number;
  timestamp: string;
}

/**
 * Message streaming/processing completed
 */
export interface MessageCompletedEvent {
  type: "message_completed";
  context_id: string;
  message_id: string;
  final_sequence: number;
  timestamp: string;
}

/**
 * Chat title has been updated (auto-generated or manually)
 */
export interface TitleUpdatedEvent {
  type: "title_updated";
  context_id: string;
  title: string;
  timestamp: string;
}

/**
 * Keep-alive heartbeat (sent every 15 seconds)
 */
export interface HeartbeatEvent {
  type: "heartbeat";
  timestamp: string;
}

/**
 * Response from content pull API (streaming chunks)
 */
export interface MessageContentResponse {
  context_id: string;
  message_id: string;
  chunks: Array<{
    sequence: number;
    delta: string;
  }>;
  current_sequence: number;
  has_more: boolean;
}

/**
 * Tool approval request event (legacy, may be deprecated)
 */
export interface ToolApprovalRequestEvent {
  type: "approval_required";
  request_id: string;
  session_id: string;
  tool: string;
  tool_description: string;
  parameters: Record<string, any>;
}

/**
 * TODO List Types for AI-driven task tracking
 */

/**
 * Status of an individual TODO item
 */
export type TodoItemStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "skipped"
  | "failed";

/**
 * Status of the overall TODO list
 */
export type TodoListStatus = "active" | "completed" | "abandoned";

/**
 * Individual item in a TODO list
 */
export interface TodoItem {
  id: string;
  description: string;
  status: TodoItemStatus;
  order: number;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

/**
 * TODO list message for tracking multi-step tasks
 */
export interface TodoListMsg {
  list_id: string;
  message_id: string;
  title: string;
  description?: string;
  items: TodoItem[];
  status: TodoListStatus;
  created_at: string;
  updated_at: string;
}

/**
 * TODO list update event (when status changes)
 */
export interface TodoListUpdatedEvent {
  type: "todo_list_updated";
  context_id: string;
  list_id: string;
  message_id: string;
  timestamp: string;
}
