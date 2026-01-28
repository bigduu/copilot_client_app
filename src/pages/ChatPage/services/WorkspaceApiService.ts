import { buildBackendUrl } from "../../../shared/utils/backendBaseUrl";
import type {
  BrowseFolderResponse,
  PathSuggestionsResponse,
  WorkspaceApiServiceOptions,
  WorkspaceMetadata,
  WorkspaceValidationResult,
} from "./workspaceApiTypes";
import {
  appendQueryParams,
  buildWorkspaceUrl,
  delay,
  runBatchRequests,
  streamWorkspaceResponse,
  uploadWorkspaceFile,
} from "./workspaceApiHelpers";

export type {
  ApiResponse,
  BrowseFolderRequest,
  BrowseFolderResponse,
  PathSuggestion,
  PathSuggestionsResponse,
  WorkspaceApiServiceOptions,
  WorkspaceMetadata,
  WorkspaceValidationResult,
} from "./workspaceApiTypes";

class WorkspaceApiService {
  private baseUrlOverride: string | null;
  private options: Omit<Required<WorkspaceApiServiceOptions>, "baseUrl">;

  constructor(options: WorkspaceApiServiceOptions = {}) {
    this.baseUrlOverride = options.baseUrl
      ? options.baseUrl.replace(/\/+$/, "")
      : null;

    this.options = {
      timeoutMs: options.timeoutMs ?? 10000,
      retries: options.retries ?? 3,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      onRequest: options.onRequest ?? (() => {}),
      onResponse: options.onResponse ?? (() => {}),
      onError: options.onError ?? (() => {}),
    };
  }

  private getBaseUrl(): string {
    return this.baseUrlOverride ?? buildBackendUrl("/workspace");
  }

  async validateWorkspacePath(
    path: string,
  ): Promise<WorkspaceValidationResult> {
    return this.post<WorkspaceValidationResult>("/validate", { path });
  }

  async getRecentWorkspaces(): Promise<WorkspaceValidationResult[]> {
    return this.get<WorkspaceValidationResult[]>("/recent");
  }

  async addRecentWorkspace(
    path: string,
    metadata?: WorkspaceMetadata,
  ): Promise<void> {
    await this.post<void>("/recent", { path, metadata });
  }

  async getPathSuggestions(): Promise<PathSuggestionsResponse> {
    return this.get<PathSuggestionsResponse>("/suggestions");
  }

  async browseFolder(path?: string): Promise<BrowseFolderResponse> {
    return this.post<BrowseFolderResponse>("/browse-folder", { path });
  }

  private async get<T>(
    endpoint: string,
    queryParams?: Record<string, string>,
  ): Promise<T> {
    const url = buildWorkspaceUrl(this.getBaseUrl(), endpoint);
    const finalUrl = appendQueryParams(url, queryParams);

    return this.request<T>(finalUrl, {
      method: "GET",
    });
  }

  private async post<T>(endpoint: string, data?: any): Promise<T> {
    const url = buildWorkspaceUrl(this.getBaseUrl(), endpoint);

    return this.request<T>(url, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  private async request<T>(
    url: string,
    options: RequestInit,
    retryCount = 0,
  ): Promise<T> {
    const requestOptions: RequestInit = {
      ...options,
      headers: {
        ...this.options.headers,
        ...options.headers,
      },
      signal: AbortSignal.timeout(this.options.timeoutMs),
    };

    this.options.onRequest(url, requestOptions);

    try {
      const response = await fetch(url, requestOptions);

      this.options.onResponse(url, response);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        return (await response.json()) as T;
      }

      return {} as T;
    } catch (error) {
      if (error instanceof Error) {
        this.options.onError(url, error);
      }

      if (this.isRetryableError(error) && retryCount < this.options.retries) {
        const delayMs = Math.pow(2, retryCount) * 1000;
        await delay(delayMs);
        return this.request<T>(url, options, retryCount + 1);
      }

      throw error;
    }
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      return (
        error.message.includes("Failed to fetch") ||
        error.message.includes("NetworkError") ||
        error.message.includes("AbortError") ||
        /^HTTP 5\d{2}/.test(error.message) ||
        error.message.includes("timeout")
      );
    }
    return false;
  }

  createAbortController(): AbortController {
    return new AbortController();
  }

  async getHealthStatus(): Promise<{
    available: boolean;
    latency?: number;
    error?: string;
  }> {
    const startTime = Date.now();

    try {
      await this.get("/recent");
      const latency = Date.now() - startTime;

      return {
        available: true,
        latency,
      };
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async batchRequests<T extends any[]>(
    requests: Array<() => Promise<T[number]>>,
  ): Promise<T> {
    const results = await runBatchRequests(requests);
    return results as T;
  }

  async uploadFile(
    endpoint: string,
    file: File,
    additionalData?: Record<string, any>,
  ): Promise<any> {
    return uploadWorkspaceFile(
      this.request.bind(this),
      this.getBaseUrl(),
      endpoint,
      this.options.headers,
      file,
      additionalData,
    );
  }

  async *streamResponse(
    endpoint: string,
    data?: any,
  ): AsyncGenerator<any, void, unknown> {
    yield* streamWorkspaceResponse(
      this.getBaseUrl(),
      endpoint,
      this.options.headers,
      data,
    );
  }
}

export const workspaceApiService = new WorkspaceApiService();

export function useWorkspaceApiService(options?: WorkspaceApiServiceOptions) {
  return new WorkspaceApiService(options);
}

export default workspaceApiService;
