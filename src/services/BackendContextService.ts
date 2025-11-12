/**
 * BackendContextService - Service for managing chat contexts via backend API
 * Replaces LocalStorage-based state management with backend Context Manager
 */

const API_BASE_URL = "http://127.0.0.1:8080/v1";

export interface ChatContextDTO {
  id: string;
  config: {
    model_id: string;
    mode: string;
    parameters: Record<string, any>;
    system_prompt_id?: string;
    agent_role: "planner" | "actor"; // Agent role (always present from backend)
    workspace_path?: string;
    mermaid_diagrams: boolean; // Whether to enable Mermaid diagram enhancement
  };
  current_state: string;
  active_branch_name: string;
  message_count: number;
  branches: Array<{
    name: string;
    system_prompt?: {
      id: string;
      content: string;
    };
    user_prompt?: string;
    message_count: number;
  }>;
  // Optional title for this context. If undefined/null, frontend should display a default title.
  title?: string;
  // Whether to automatically generate a title after the first AI response.
  auto_generate_title: boolean;
}

export interface MessageDTO {
  id: string;
  role: string;
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; url: string; detail?: string }
  >;
  message_type?: "text" | "plan" | "question" | "tool_call" | "tool_result"; // Message type for rendering
  tool_calls?: Array<{
    id: string;
    tool_name: string;
    arguments: any;
    approval_status: string;
    display_preference: string;
    ui_hints?: any;
  }>;
  tool_result?: {
    request_id: string;
    result: any;
  };
}

export interface GenerateTitleResponse {
  title: string;
}

export interface SystemPromptDTO {
  id: string;
  content: string;
}

export interface CreateContextRequest {
  model_id: string;
  mode: string;
  system_prompt_id?: string;
  workspace_path?: string;
}

export interface ContextSummaryDTO {
  id: string;
  config: {
    model_id: string;
    mode: string;
    system_prompt_id?: string;
    workspace_path?: string;
  };
  current_state: string;
  active_branch_name: string;
  message_count: number;
  // Optional title for this context. If undefined/null, frontend should display a default title.
  title?: string;
  // Whether to automatically generate a title after the first AI response.
  auto_generate_title: boolean;
}

export interface WorkspaceFileEntry {
  name: string;
  path: string;
  is_directory: boolean;
}

export interface AddMessageRequest {
  role: string;
  content: string;
  branch?: string;
}

export interface ApproveToolsRequest {
  tool_call_ids: string[];
}

export interface MessageQueryParams {
  branch?: string;
  limit?: number;
  offset?: number;
}

export interface ActionResponse {
  context: ChatContextDTO;
  status: string; // "idle", "awaiting_tool_approval", etc.
}

export class BackendContextService {
  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options?.headers,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      // Handle empty responses
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        return await response.json();
      }

      return {} as T;
    } catch (error) {
      console.error(`BackendContextService error on ${endpoint}:`, error);
      throw error;
    }
  }

  // Context CRUD
  async createContext(req: CreateContextRequest): Promise<{ id: string }> {
    return this.request<{ id: string }>("/contexts", {
      method: "POST",
      body: JSON.stringify(req),
    });
  }

  async getContext(id: string): Promise<ChatContextDTO> {
    return this.request<ChatContextDTO>(`/contexts/${id}`);
  }

  async updateContext(
    id: string,
    updates: Partial<ChatContextDTO>
  ): Promise<void> {
    await this.request<void>(`/contexts/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  }

  async deleteContext(id: string): Promise<void> {
    await this.request<void>(`/contexts/${id}`, {
      method: "DELETE",
    });
  }

  async listContexts(): Promise<Array<ContextSummaryDTO>> {
    const response = await this.request<{ contexts: ContextSummaryDTO[] }>(
      "/contexts"
    );
    return response.contexts || [];
  }

  // Message operations
  async getMessages(
    contextId: string,
    params?: MessageQueryParams
  ): Promise<{
    messages: MessageDTO[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const queryParams = new URLSearchParams();
    if (params?.branch) queryParams.append("branch", params.branch);
    if (params?.limit) queryParams.append("limit", params.limit.toString());
    if (params?.offset) queryParams.append("offset", params.offset.toString());

    const query = queryParams.toString();
    const endpoint = `/contexts/${contextId}/messages${
      query ? `?${query}` : ""
    }`;

    return this.request<{
      messages: MessageDTO[];
      total: number;
      limit: number;
      offset: number;
    }>(endpoint);
  }

  async addMessage(
    contextId: string,
    message: AddMessageRequest
  ): Promise<void> {
    await this.request<void>(`/contexts/${contextId}/messages`, {
      method: "POST",
      body: JSON.stringify(message),
    });
  }

  async approveTools(
    contextId: string,
    req: ApproveToolsRequest
  ): Promise<void> {
    await this.request<void>(`/contexts/${contextId}/tools/approve`, {
      method: "POST",
      body: JSON.stringify(req),
    });
  }

  async generateTitle(
    contextId: string,
    options?: {
      maxLength?: number;
      messageLimit?: number;
      fallbackTitle?: string;
    }
  ): Promise<GenerateTitleResponse> {
    const payload = {
      max_length: options?.maxLength,
      message_limit: options?.messageLimit,
      fallback_title: options?.fallbackTitle,
    };

    return this.request<GenerateTitleResponse>(
      `/contexts/${contextId}/generate-title`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
  }

  /**
   * Update context configuration (e.g., auto_generate_title, mermaid_diagrams)
   */
  async updateContextConfig(
    contextId: string,
    config: {
      auto_generate_title?: boolean;
      mermaid_diagrams?: boolean;
    }
  ): Promise<void> {
    await this.request<void>(`/contexts/${contextId}/config`, {
      method: "PATCH",
      body: JSON.stringify(config),
    });
  }

  // ============================================================================
  // ACTION-BASED API (Backend-First Architecture)
  // ============================================================================

  /**
   * Send a message using the action-based API.
   * The backend FSM handles all processing and auto-saves state.
   * Returns the updated context and status.
   */
  async sendMessageAction(
    contextId: string,
    content: string
  ): Promise<ActionResponse> {
    return this.request<ActionResponse>(
      `/contexts/${contextId}/actions/send_message`,
      {
        method: "POST",
        body: JSON.stringify({ content }),
      }
    );
  }

  /**
   * Approve tool calls using the action-based API.
   * The backend FSM continues processing and auto-saves state.
   * Returns the updated context and status.
   */
  async approveToolsAction(
    contextId: string,
    toolCallIds: string[]
  ): Promise<ActionResponse> {
    return this.request<ActionResponse>(
      `/contexts/${contextId}/actions/approve_tools`,
      {
        method: "POST",
        body: JSON.stringify({ tool_call_ids: toolCallIds }),
      }
    );
  }

  /**
   * Approve or reject an agent-initiated tool call.
   * Used when the LLM autonomously invokes a tool that requires user approval.
   */
  async approveAgentToolCall(
    sessionId: string,
    requestId: string,
    approved: boolean,
    reason?: string
  ): Promise<{ status: string; message: string }> {
    return await this.request<{ status: string; message: string }>(
      `/chat/${sessionId}/approve-agent`,
      {
        method: "POST",
        body: JSON.stringify({
          request_id: requestId,
          approved,
          reason,
        }),
      }
    );
  }

  /**
   * Get the current state of a context for polling.
   * Returns the full context and current FSM status.
   */
  async getChatState(contextId: string): Promise<ActionResponse> {
    return this.request<ActionResponse>(`/contexts/${contextId}/state`);
  }

  /**
   * Update the agent role for a context.
   * @param contextId - The context ID
   * @param role - The new role ("planner" or "actor")
   * @returns Response with success status and updated role information
   */
  async updateAgentRole(
    contextId: string,
    role: "planner" | "actor"
  ): Promise<{
    success: boolean;
    context_id: string;
    old_role: string;
    new_role: string;
    message: string;
  }> {
    return this.request(`/contexts/${contextId}/role`, {
      method: "PUT",
      body: JSON.stringify({ role }),
    });
  }

  async setWorkspacePath(
    contextId: string,
    workspacePath: string
  ): Promise<{ workspace_path?: string }> {
    return this.request(`/contexts/${contextId}/workspace`, {
      method: "PUT",
      body: JSON.stringify({ workspace_path: workspacePath }),
    });
  }

  async getWorkspacePath(
    contextId: string
  ): Promise<{ workspace_path?: string }> {
    return this.request(`/contexts/${contextId}/workspace`);
  }

  async getWorkspaceFiles(
    contextId: string
  ): Promise<{ workspace_path: string; files: WorkspaceFileEntry[] }> {
    return this.request(`/contexts/${contextId}/workspace/files`);
  }

  // System prompt operations
  async createSystemPrompt(
    id: string,
    content: string
  ): Promise<{ id: string }> {
    return this.request<{ id: string }>("/system-prompts", {
      method: "POST",
      body: JSON.stringify({ id, content }),
    });
  }

  async getSystemPrompt(id: string): Promise<SystemPromptDTO> {
    return this.request<SystemPromptDTO>(`/system-prompts/${id}`);
  }

  async updateSystemPrompt(id: string, content: string): Promise<void> {
    await this.request<void>(`/system-prompts/${id}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    });
  }

  async deleteSystemPrompt(id: string): Promise<void> {
    await this.request<void>(`/system-prompts/${id}`, {
      method: "DELETE",
    });
  }

  async listSystemPrompts(): Promise<SystemPromptDTO[]> {
    const response = await this.request<{ prompts: SystemPromptDTO[] }>(
      "/system-prompts"
    );
    return response.prompts || [];
  }

  async reloadSystemPrompts(): Promise<{ reloaded: number }> {
    return this.request<{ reloaded: number }>("/system-prompts/reload", {
      method: "POST",
    });
  }

  // ============================================================================
  // Signal-Pull SSE Architecture (New)
  // ============================================================================

  /**
   * Subscribe to context events using EventSource (SSE).
   * This is the new Signal-Pull architecture where the backend sends
   * lightweight metadata events, and the frontend pulls content via REST API.
   *
   * @param contextId - The context ID to subscribe to
   * @param onEvent - Callback for each SSE event
   * @param onError - Callback for errors
   * @returns Cleanup function to close the EventSource
   */
  subscribeToContextEvents(
    contextId: string,
    onEvent: (event: import("../types/sse").SignalEvent) => void,
    onError?: (error: Error) => void
  ): () => void {
    const eventSource = new EventSource(
      `${API_BASE_URL}/contexts/${contextId}/events`
    );

    // Listen for "signal" events (backend sends named events)
    eventSource.addEventListener("signal", (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("[SSE] Signal event received:", data);
        onEvent(data);
      } catch (error) {
        console.error("[SSE] Failed to parse signal event:", error);
        onError?.(error as Error);
      }
    });

    // Also listen for default "message" events (fallback)
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("[SSE] Message event received:", data);
        onEvent(data);
      } catch (error) {
        console.error("[SSE] Failed to parse message event:", error);
        onError?.(error as Error);
      }
    };

    eventSource.onerror = (error) => {
      console.error("[SSE] EventSource error:", error);
      console.log("[SSE] ReadyState:", eventSource.readyState);
      // ReadyState: 0 = CONNECTING, 1 = OPEN, 2 = CLOSED

      if (eventSource.readyState === EventSource.CLOSED) {
        console.log("[SSE] Connection closed, attempting to reconnect...");
      }

      onError?.(new Error("EventSource connection error"));
    };

    eventSource.addEventListener("open", () => {
      console.log("[SSE] ✅ EventSource connected to context:", contextId);
    });

    // Return cleanup function
    return () => {
      console.log("[SSE] Closing EventSource for context:", contextId);
      eventSource.close();
    };
  }

  /**
   * Get message content (full or incremental).
   * This is used in the Signal-Pull architecture to fetch actual content
   * after receiving a content_delta event.
   *
   * @param contextId - The context ID
   * @param messageId - The message ID
   * @param fromSequence - Optional: get content from this sequence onwards
   * @returns Message content with sequence number
   */
  async getMessageContent(
    contextId: string,
    messageId: string,
    fromSequence?: number
  ): Promise<import("../types/sse").MessageContentResponse> {
    const url =
      fromSequence !== undefined
        ? `/contexts/${contextId}/messages/${messageId}/streaming-chunks?from_sequence=${fromSequence}`
        : `/contexts/${contextId}/messages/${messageId}/streaming-chunks`;

    console.log(`[SSE] Pulling content from sequence ${fromSequence ?? 0}`);

    const response =
      await this.request<import("../types/sse").MessageContentResponse>(url);

    console.log(
      `[SSE] Content received: current_sequence=${response.current_sequence}, chunks=${response.chunks.length}, has_more=${response.has_more}`
    );

    return response;
  }

  /**
   * Send a message to the context (triggers backend processing).
   * This is the new non-streaming API that works with the Signal-Pull architecture.
   * After calling this, subscribe to SSE events to receive updates.
   *
   * @param contextId - The context ID
   * @param content - The message content (can be plain text or JSON string for structured messages)
   */
  async sendMessage(contextId: string, content: string): Promise<void> {
    console.log(`[SSE] Sending message to context ${contextId}`);

    // Try to parse content as JSON to detect structured messages (file_reference, workflow, etc.)
    let payload: any;
    try {
      const parsed = JSON.parse(content);
      // If it's a structured message with a type field, use it directly as payload
      if (parsed.type && typeof parsed.type === "string") {
        payload = parsed;
      } else {
        // Not a structured message, treat as plain text
        payload = {
          type: "text",
          content,
          display: null,
        };
      }
    } catch (e) {
      // Not JSON, treat as plain text
      payload = {
        type: "text",
        content,
        display: null,
      };
    }

    await this.request<void>(`/contexts/${contextId}/actions/send_message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        payload,
        client_metadata: {},
      }),
    });

    console.log(`[SSE] Message sent successfully`);
  }
}

export const backendContextService = new BackendContextService();
