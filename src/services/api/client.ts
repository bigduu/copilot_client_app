/**
 * Unified HTTP API Client
 *
 * Provides a consistent interface for making HTTP requests to the backend API.
 * Eliminates duplicate fetch logic across services.
 *
 * Backend has two route prefixes:
 * - /v1/*       - Standard web_service routes (models, bamboo/*, workspace/*, mcp/*, claude/*)
 * - /api/v1/*   - Agent server routes (chat, stream, todo, respond, sessions, metrics)
 */
import { getBackendBaseUrl } from "../../shared/utils/backendBaseUrl";

export interface ApiClientConfig {
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public statusText: string,
    public body?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export class ApiClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;

  constructor(config: ApiClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? this.resolveBaseUrl();
    this.defaultHeaders = config.defaultHeaders ?? {
      "Content-Type": "application/json",
    };
  }

  private resolveBaseUrl(): string {
    let normalized = getBackendBaseUrl().trim().replace(/\/+$/, "");

    // Default to /v1 (standard web_service routes)
    if (normalized.endsWith("/v1")) {
      return normalized;
    }

    return `${normalized}/v1`;
  }

  private buildUrl(path: string): string {
    const cleanPath = path.replace(/^\/+/, "");
    return `${this.baseUrl}/${cleanPath}`;
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const body = await response.text().catch(() => undefined);
      throw new ApiError(
        `API request failed: ${response.statusText}`,
        response.status,
        response.statusText,
        body,
      );
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    // Check content type to determine how to parse response
    const contentType = response.headers?.get?.("content-type") || "";
    if (contentType.includes("application/json")) {
      return response.json();
    }

    // For non-JSON responses (like health check returning "OK")
    // Use text() if available, otherwise fall back to json() for test mocks
    if (typeof response.text === "function") {
      const text = await response.text();
      return text as T;
    }
    return response.json();
  }

  /**
   * Make a GET request
   */
  async get<T>(path: string, options?: RequestInit): Promise<T> {
    const url = this.buildUrl(path);
    const response = await fetch(url, {
      ...options,
      method: "GET",
      headers: {
        ...this.defaultHeaders,
        ...options?.headers,
      },
    });
    return this.handleResponse<T>(response);
  }

  /**
   * Make a POST request
   */
  async post<T>(
    path: string,
    data?: unknown,
    options?: RequestInit,
  ): Promise<T> {
    const url = this.buildUrl(path);
    const response = await fetch(url, {
      ...options,
      method: "POST",
      headers: {
        ...this.defaultHeaders,
        ...options?.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    return this.handleResponse<T>(response);
  }

  /**
   * Make a PUT request
   */
  async put<T>(
    path: string,
    data?: unknown,
    options?: RequestInit,
  ): Promise<T> {
    const url = this.buildUrl(path);
    const response = await fetch(url, {
      ...options,
      method: "PUT",
      headers: {
        ...this.defaultHeaders,
        ...options?.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    return this.handleResponse<T>(response);
  }

  /**
   * Make a DELETE request
   */
  async delete<T>(path: string, options?: RequestInit): Promise<T> {
    const url = this.buildUrl(path);
    const response = await fetch(url, {
      ...options,
      method: "DELETE",
      headers: {
        ...this.defaultHeaders,
        ...options?.headers,
      },
    });
    return this.handleResponse<T>(response);
  }

  /**
   * Make a request with custom method
   */
  async request<T>(
    method: string,
    path: string,
    options?: RequestInit,
  ): Promise<T> {
    const url = this.buildUrl(path);
    const response = await fetch(url, {
      ...options,
      method,
      headers: {
        ...this.defaultHeaders,
        ...options?.headers,
      },
    });
    return this.handleResponse<T>(response);
  }

  /**
   * Make a request and return raw Response for streaming
   */
  async fetchRaw(path: string, options?: RequestInit): Promise<Response> {
    const url = this.buildUrl(path);
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.defaultHeaders,
        ...options?.headers,
      },
    });

    if (!response.ok) {
      throw new ApiError(
        `API request failed: ${response.statusText}`,
        response.status,
        response.statusText,
      );
    }

    return response;
  }
}

// Export singleton instance for standard API (/v1)
export const apiClient = new ApiClient();

/**
 * Agent API Client for /api/v1 routes
 *
 * Used for agent-specific endpoints:
 * - chat, stream, stop, history
 * - todo, respond, sessions
 * - metrics, health
 */
export const agentApiClient = new ApiClient({
  baseUrl: (() => {
    let normalized = getBackendBaseUrl().trim().replace(/\/+$/, "");
    // Remove /v1 suffix if present, then add /api/v1
    if (normalized.endsWith("/v1")) {
      normalized = normalized.slice(0, -3);
    }
    return `${normalized}/api/v1`;
  })(),
});
