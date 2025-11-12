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
  | HeartbeatEvent;

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
