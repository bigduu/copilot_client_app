/**
 * Workspace API Service
 * Centralized HTTP client for workspace-related API operations
 * with proper error handling, request/response interceptors, and type safety
 */

export interface WorkspaceValidationResult {
  path: string;
  is_valid: boolean;
  error_message?: string;
  file_count?: number;
  last_modified?: string;
  size_bytes?: number;
  workspace_name?: string;
}

export interface WorkspaceMetadata {
  workspace_name?: string;
  description?: string;
  tags?: string[];
}

export interface PathSuggestion {
  path: string;
  name: string;
  description?: string;
  suggestion_type: 'recent' | 'common' | 'home' | 'documents' | 'desktop' | 'downloads';
}

export interface PathSuggestionsResponse {
  suggestions: PathSuggestion[];
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface WorkspaceApiServiceOptions {
  baseUrl?: string;
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  onRequest?: (url: string, options: RequestInit) => void;
  onResponse?: (url: string, response: Response) => void;
  onError?: (url: string, error: Error) => void;
}

class WorkspaceApiService {
  private options: Required<WorkspaceApiServiceOptions>;

  constructor(options: WorkspaceApiServiceOptions = {}) {
    this.options = {
      baseUrl: options.baseUrl ?? 'http://localhost:8080/v1/workspace',
      timeoutMs: options.timeoutMs ?? 10000,
      retries: options.retries ?? 3,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      onRequest: options.onRequest ?? (() => {}),
      onResponse: options.onResponse ?? (() => {}),
      onError: options.onError ?? (() => {}),
    };
  }

  /**
   * Validate a workspace path
   */
  async validateWorkspacePath(path: string): Promise<WorkspaceValidationResult> {
    return this.post<WorkspaceValidationResult>('/validate', { path });
  }

  /**
   * Get recent workspaces
   */
  async getRecentWorkspaces(): Promise<WorkspaceValidationResult[]> {
    return this.get<WorkspaceValidationResult[]>('/recent');
  }

  /**
   * Add a workspace to recent workspaces
   */
  async addRecentWorkspace(path: string, metadata?: WorkspaceMetadata): Promise<void> {
    await this.post<void>('/recent', { path, metadata });
  }

  /**
   * Get path suggestions
   */
  async getPathSuggestions(): Promise<PathSuggestionsResponse> {
    return this.get<PathSuggestionsResponse>('/suggestions');
  }

  /**
   * Generic GET request
   */
  private async get<T>(endpoint: string, queryParams?: Record<string, string>): Promise<T> {
    const baseUrl = this.options.baseUrl.endsWith('/') ? this.options.baseUrl.slice(0, -1) : this.options.baseUrl;
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
    const url = `${baseUrl}/${cleanEndpoint}`;

    const finalUrl = new URL(url);

    if (queryParams) {
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          finalUrl.searchParams.append(key, value);
        }
      });
    }

    return this.request<T>(finalUrl.toString(), {
      method: 'GET',
    });
  }

  /**
   * Generic POST request
   */
  private async post<T>(endpoint: string, data?: any): Promise<T> {
    const baseUrl = this.options.baseUrl.endsWith('/') ? this.options.baseUrl.slice(0, -1) : this.options.baseUrl;
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
    const url = `${baseUrl}/${cleanEndpoint}`;

    return this.request<T>(url, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  // Note: PUT and DELETE methods available for future use
  // private async put<T>(endpoint: string, data?: any): Promise<T>
  // private async delete<T>(endpoint: string): Promise<T>

  /**
   * Core request method with retry logic and error handling
   */
  private async request<T>(url: string, options: RequestInit, retryCount = 0): Promise<T> {
    const requestOptions: RequestInit = {
      ...options,
      headers: {
        ...this.options.headers,
        ...options.headers,
      },
      signal: AbortSignal.timeout(this.options.timeoutMs),
    };

    // Call request interceptor
    this.options.onRequest(url, requestOptions);

    try {
      const response = await fetch(url, requestOptions);

      // Call response interceptor
      this.options.onResponse(url, response);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      // Handle empty responses
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json() as T;
      } else {
        return {} as T;
      }
    } catch (error) {
      // Call error interceptor
      if (error instanceof Error) {
        this.options.onError(url, error);
      }

      // Retry logic for retryable errors
      if (this.isRetryableError(error) && retryCount < this.options.retries) {
        const delayMs = Math.pow(2, retryCount) * 1000; // Exponential backoff
        await this.delay(delayMs);
        return this.request<T>(url, options, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      // Network errors and 5xx server errors are retryable
      return (
        error.message.includes('Failed to fetch') ||
        error.message.includes('NetworkError') ||
        error.message.includes('AbortError') ||
        /^HTTP 5\d{2}/.test(error.message) ||
        error.message.includes('timeout')
      );
    }
    return false;
  }

  /**
   * Utility function for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cancel all pending requests (using AbortController)
   */
  createAbortController(): AbortController {
    return new AbortController();
  }

  /**
   * Get service health status
   */
  async getHealthStatus(): Promise<{
    available: boolean;
    latency?: number;
    error?: string;
  }> {
    const startTime = Date.now();

    try {
      // Use a lightweight endpoint for health check
      await this.get('/recent');
      const latency = Date.now() - startTime;

      return {
        available: true,
        latency,
      };
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Batch multiple requests for better performance
   */
  async batchRequests<T extends any[]>(
    requests: Array<() => Promise<T[number]>>
  ): Promise<T> {
    const BATCH_SIZE = 5;
    const results: any[] = [];

    for (let i = 0; i < requests.length; i += BATCH_SIZE) {
      const batch = requests.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(request => request()));
      results.push(...batchResults);

      // Small delay between batches to avoid overwhelming the server
      if (i + BATCH_SIZE < requests.length) {
        await this.delay(50);
      }
    }

    return results as T;
  }

  /**
   * Upload files (for future use - workspace file upload)
   */
  async uploadFile(endpoint: string, file: File, additionalData?: Record<string, any>): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);

    if (additionalData) {
      Object.entries(additionalData).forEach(([key, value]) => {
        formData.append(key, String(value));
      });
    }

    return this.request(`${this.options.baseUrl}${endpoint}`, {
      method: 'POST',
      body: formData,
      // Don't set Content-Type header for FormData (browser sets it with boundary)
      headers: Object.fromEntries(
        Object.entries(this.options.headers).filter(([key]) => key.toLowerCase() !== 'content-type')
      ),
    });
  }

  /**
   * Stream responses (for future use - workspace sync)
   */
  async *streamResponse(endpoint: string, data?: any): AsyncGenerator<any, void, unknown> {
    const response = await fetch(`${this.options.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.options.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            yield data;
          } catch (error) {
            // Ignore invalid JSON lines
            console.warn('Failed to parse streaming response line:', line);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

// Singleton instance with default configuration
export const workspaceApiService = new WorkspaceApiService();

// Hook for React components
export function useWorkspaceApiService(options?: WorkspaceApiServiceOptions) {
  return new WorkspaceApiService(options);
}

export default workspaceApiService;