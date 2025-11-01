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

export interface SystemPromptDTO {
  id: string;
  content: string;
}

export interface CreateContextRequest {
  model_id: string;
  mode: string;
  system_prompt_id?: string;
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
        throw new Error(
          `API error: ${response.status} - ${errorText}`
        );
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

  async updateContext(id: string, updates: Partial<ChatContextDTO>): Promise<void> {
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

  async listContexts(): Promise<Array<ChatContextDTO>> {
    const response = await this.request<{ contexts: ChatContextDTO[] }>("/contexts");
    return response.contexts || [];
  }

  // Message operations
  async getMessages(
    contextId: string,
    params?: MessageQueryParams
  ): Promise<{ messages: MessageDTO[]; total: number; limit: number; offset: number }> {
    const queryParams = new URLSearchParams();
    if (params?.branch) queryParams.append("branch", params.branch);
    if (params?.limit) queryParams.append("limit", params.limit.toString());
    if (params?.offset) queryParams.append("offset", params.offset.toString());

    const query = queryParams.toString();
    const endpoint = `/contexts/${contextId}/messages${query ? `?${query}` : ""}`;

    return this.request<{
      messages: MessageDTO[];
      total: number;
      limit: number;
      offset: number;
    }>(endpoint);
  }

  async addMessage(contextId: string, message: AddMessageRequest): Promise<void> {
    await this.request<void>(`/contexts/${contextId}/messages`, {
      method: "POST",
      body: JSON.stringify(message),
    });
  }

  async approveTools(contextId: string, req: ApproveToolsRequest): Promise<void> {
    await this.request<void>(`/contexts/${contextId}/tools/approve`, {
      method: "POST",
      body: JSON.stringify(req),
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
  async sendMessageAction(contextId: string, content: string): Promise<ActionResponse> {
    return this.request<ActionResponse>(`/contexts/${contextId}/actions/send_message`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
  }

  /**
   * Approve tool calls using the action-based API.
   * The backend FSM continues processing and auto-saves state.
   * Returns the updated context and status.
   */
  async approveToolsAction(contextId: string, toolCallIds: string[]): Promise<ActionResponse> {
    return this.request<ActionResponse>(`/contexts/${contextId}/actions/approve_tools`, {
      method: "POST",
      body: JSON.stringify({ tool_call_ids: toolCallIds }),
    });
  }

  /**
   * Get the current state of a context for polling.
   * Returns the full context and current FSM status.
   */
  async getChatState(contextId: string): Promise<ActionResponse> {
    return this.request<ActionResponse>(`/contexts/${contextId}/state`);
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
}

// Singleton instance
export const backendContextService = new BackendContextService();

