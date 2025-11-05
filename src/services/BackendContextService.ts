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
    options?: RequestInit,
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
    updates: Partial<ChatContextDTO>,
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
      "/contexts",
    );
    return response.contexts || [];
  }

  // Message operations
  async getMessages(
    contextId: string,
    params?: MessageQueryParams,
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
    message: AddMessageRequest,
  ): Promise<void> {
    await this.request<void>(`/contexts/${contextId}/messages`, {
      method: "POST",
      body: JSON.stringify(message),
    });
  }

  async approveTools(
    contextId: string,
    req: ApproveToolsRequest,
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
    },
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
      },
    );
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
    content: string,
  ): Promise<ActionResponse> {
    return this.request<ActionResponse>(
      `/contexts/${contextId}/actions/send_message`,
      {
        method: "POST",
        body: JSON.stringify({ content }),
      },
    );
  }

  /**
   * Send a message with streaming response using SSE.
   * This uses the /chat/{session_id}/stream endpoint for real-time token streaming.
   * @param contextId - The context/session ID
   * @param content - The message content
   * @param onChunk - Callback for each content chunk
   * @param onDone - Callback when stream is complete
   * @param onError - Callback for errors
   * @param onApprovalRequired - Callback when agent-initiated tool requires approval
   */
  async sendMessageStream(
    contextId: string,
    content: string,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    onError: (error: string) => void,
    onApprovalRequired?: (data: {
      request_id: string;
      session_id: string;
      tool: string;
      tool_description: string;
      parameters: Record<string, any>;
    }) => void,
  ): Promise<void> {
    try {
      // Use API_BASE_URL which already includes /v1, then add /chat path
      const baseUrl = API_BASE_URL.replace("/v1", ""); // http://127.0.0.1:8080
      const response = await fetch(`${baseUrl}/v1/chat/${contextId}/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(content),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let streamCompleted = false;

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6); // Remove "data: " prefix
            
            // Check for [DONE] signal
            if (data === "[DONE]") {
              streamCompleted = true;
              onDone();
              return;
            }
            
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "approval_required") {
                // Agent-initiated tool call requires user approval
                console.log("🔒 Agent tool approval required:", parsed);
                if (onApprovalRequired) {
                  onApprovalRequired({
                    request_id: parsed.request_id,
                    session_id: parsed.session_id,
                    tool: parsed.tool,
                    tool_description: parsed.tool_description,
                    parameters: parsed.parameters,
                  });
                }
                // Don't return here - wait for done signal
              } else if (parsed.done) {
                streamCompleted = true;
                onDone();
                return;
              } else if (parsed.content) {
                onChunk(parsed.content);
              } else if (parsed.error) {
                onError(parsed.error);
                return;
              }
            } catch (e) {
              console.error("Failed to parse SSE data:", data, e);
            }
          }
        }
      }

      // Only call onDone if stream wasn't explicitly marked as done
      if (!streamCompleted) {
        onDone();
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      onError(errorMsg);
      throw error;
    }
  }

  /**
   * Approve tool calls using the action-based API.
   * The backend FSM continues processing and auto-saves state.
   * Returns the updated context and status.
   */
  async approveToolsAction(
    contextId: string,
    toolCallIds: string[],
  ): Promise<ActionResponse> {
    return this.request<ActionResponse>(
      `/contexts/${contextId}/actions/approve_tools`,
      {
        method: "POST",
        body: JSON.stringify({ tool_call_ids: toolCallIds }),
      },
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
    reason?: string,
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
      },
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
    role: "planner" | "actor",
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
    workspacePath: string,
  ): Promise<{ workspace_path?: string }> {
    return this.request(`/contexts/${contextId}/workspace`, {
      method: "PUT",
      body: JSON.stringify({ workspace_path: workspacePath }),
    });
  }

  async getWorkspacePath(
    contextId: string,
  ): Promise<{ workspace_path?: string }> {
    return this.request(`/contexts/${contextId}/workspace`);
  }

  async getWorkspaceFiles(
    contextId: string,
  ): Promise<{ workspace_path: string; files: WorkspaceFileEntry[] }> {
    return this.request(`/contexts/${contextId}/workspace/files`);
  }

  // System prompt operations
  async createSystemPrompt(
    id: string,
    content: string,
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
      "/system-prompts",
    );
    return response.prompts || [];
  }

  async reloadSystemPrompts(): Promise<{ reloaded: number }> {
    return this.request<{ reloaded: number }>("/system-prompts/reload", {
      method: "POST",
    });
  }
}

export const backendContextService = new BackendContextService();
