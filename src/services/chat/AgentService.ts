/**
 * Agent Client Service
 *
 * HTTP client for communicating with local copilot-agent endpoints
 * Handles SSE streaming and AgentEvent processing
 */
import { getBackendBaseUrl } from "../../shared/utils/backendBaseUrl";

// Agent Event Types (matching Rust backend)
export type AgentEventType =
  | "token"
  | "tool_start"
  | "tool_complete"
  | "tool_error"
  | "complete"
  | "error";

export interface AgentEvent {
  type: AgentEventType;
  content?: string;
  tool_call_id?: string;
  tool_name?: string;
  arguments?: Record<string, unknown>;
  result?: {
    success: boolean;
    result: string;
    display_preference?: string;
  };
  error?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ChatRequest {
  message: string;
  session_id?: string;
  system_prompt?: string;
  enhance_prompt?: string;
  workspace_path?: string;
  model?: string;
}

export interface ChatResponse {
  session_id: string;
  stream_url: string;
  status: string;
}

export interface HistoryResponse {
  session_id: string;
  messages: Array<{
    id: string;
    role: "user" | "assistant" | "tool" | "system";
    content: string;
    tool_calls?: Array<{
      id: string;
      type: string;
      function: {
        name: string;
        arguments: string;
      };
    }>;
    tool_call_id?: string;
    created_at: string;
  }>;
}

// Event handlers type
export interface AgentEventHandlers {
  onToken?: (content: string) => void;
  onToolStart?: (
    toolCallId: string,
    toolName: string,
    args: Record<string, unknown>,
  ) => void;
  onToolComplete?: (toolCallId: string, result: AgentEvent["result"]) => void;
  onToolError?: (toolCallId: string, error: string) => void;
  onComplete?: (usage: AgentEvent["usage"]) => void;
  onError?: (message: string) => void;
}

/**
 * Agent Client - HTTP client for copilot-agent-server
 */
export class AgentClient {
  private baseUrl: string;
  private static instance: AgentClient;

  constructor(baseUrl = AgentClient.resolveBaseUrl()) {
    this.baseUrl = baseUrl;
  }

  private static resolveBaseUrl(): string {
    const normalized = getBackendBaseUrl().trim().replace(/\/+$/, "");
    return normalized.endsWith("/v1") ? normalized.slice(0, -3) : normalized;
  }

  static getInstance(baseUrl?: string): AgentClient {
    if (!AgentClient.instance) {
      AgentClient.instance = new AgentClient(baseUrl);
    }
    return AgentClient.instance;
  }

  /**
   * Send a chat message and get session ID
   */
  async sendMessage(request: ChatRequest): Promise<ChatResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Stream events from the agent using SSE
   */
  async streamEvents(
    sessionId: string,
    handlers: AgentEventHandlers,
    abortController?: AbortController,
  ): Promise<void> {
    const signal = abortController?.signal;
    const response = await fetch(`${this.baseUrl}/api/v1/stream/${sessionId}`, {
      signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to stream events: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        if (signal?.aborted) {
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process SSE lines
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);

            // Check for [DONE] marker
            if (data === "[DONE]") {
              return;
            }

            try {
              const event: AgentEvent = JSON.parse(data);
              this.handleEvent(event, handlers);
            } catch (e) {
              console.warn("Failed to parse event:", data, e);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Handle a single agent event
   */
  private handleEvent(event: AgentEvent, handlers: AgentEventHandlers): void {
    switch (event.type) {
      case "token":
        handlers.onToken?.(event.content || "");
        break;
      case "tool_start":
        handlers.onToolStart?.(
          event.tool_call_id || "",
          event.tool_name || "",
          event.arguments || {},
        );
        break;
      case "tool_complete":
        if (event.result) {
          handlers.onToolComplete?.(event.tool_call_id || "", event.result);
        }
        break;
      case "tool_error":
        handlers.onToolError?.(event.tool_call_id || "", event.error || "");
        break;
      case "complete":
        handlers.onComplete?.(event.usage);
        break;
      case "error":
        handlers.onError?.(event.error || "Unknown error");
        break;
      default:
        console.warn("Unknown event type:", event);
    }
  }

  /**
   * Stop generation for a session
   */
  async stopGeneration(sessionId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/v1/stop/${sessionId}`, {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`Failed to stop generation: ${response.statusText}`);
    }
  }

  /**
   * Get chat history
   */
  async getHistory(sessionId: string): Promise<HistoryResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/history/${sessionId}`);

    if (!response.ok) {
      throw new Error(`Failed to get history: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const agentClient = AgentClient.getInstance();
