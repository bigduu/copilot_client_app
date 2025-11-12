const API_BASE_URL = "http://127.0.0.1:8080/v1";
const DEFAULT_USER_ID = "default_user";

export interface OpenContextDTO {
  context_id: string;
  title: string;
  order: number;
}

export interface UserSessionDTO {
  user_id: string;
  active_context_id?: string | null;
  open_contexts: OpenContextDTO[];
}

export interface SetActiveContextRequest {
  context_id: string;
}

export interface OpenContextRequest {
  context_id: string;
  title: string;
}

export class SessionService {
  private userId: string;

  constructor(userId: string = DEFAULT_USER_ID) {
    this.userId = userId;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${API_BASE_URL}/session${endpoint}`, {
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `SessionService error: ${response.status} ${response.statusText} - ${text}`
      );
    }

    if (response.status === 204) {
      return {} as T;
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return (await response.json()) as T;
    }

    return {} as T;
  }

  /**
   * Get or create user session
   */
  async getSession(): Promise<UserSessionDTO> {
    return this.request<UserSessionDTO>(`/${this.userId}`, {
      method: "GET",
    });
  }

  /**
   * Set the active context
   */
  async setActiveContext(contextId: string): Promise<void> {
    await this.request<void>(`/${this.userId}/active-context`, {
      method: "POST",
      body: JSON.stringify({ context_id: contextId }),
    });
  }

  /**
   * Clear the active context
   */
  async clearActiveContext(): Promise<void> {
    await this.request<void>(`/${this.userId}/active-context`, {
      method: "DELETE",
    });
  }

  /**
   * Open a context (add to session)
   */
  async openContext(contextId: string, title: string): Promise<void> {
    await this.request<void>(`/${this.userId}/open-context`, {
      method: "POST",
      body: JSON.stringify({ context_id: contextId, title }),
    });
  }

  /**
   * Close a context (remove from session)
   */
  async closeContext(contextId: string): Promise<void> {
    await this.request<void>(`/${this.userId}/context/${contextId}`, {
      method: "DELETE",
    });
  }
}

