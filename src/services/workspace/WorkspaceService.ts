/**
 * Workspace Service
 *
 * Unified workspace management service.
 * Merged from WorkspaceApiService and RecentWorkspacesManager.
 * Uses unified ApiClient for HTTP requests.
 */
import { apiClient } from "../api";
import type {
  Workspace,
  WorkspaceMetadata,
  PathSuggestionsResponse,
  BrowseFolderResponse,
  WorkspaceServiceOptions,
} from "./types";

export class WorkspaceService {
  private cache: {
    recentWorkspaces: Workspace[] | null;
    timestamp: number;
  } | null = null;

  private options: {
    maxRecentWorkspaces: number;
    cacheTimeoutMs: number;
    requestTimeoutMs: number;
  };

  constructor(options: WorkspaceServiceOptions = {}) {
    this.options = {
      maxRecentWorkspaces: options.maxRecentWorkspaces ?? 10,
      cacheTimeoutMs: options.cacheTimeoutMs ?? 5 * 60 * 1000,
      requestTimeoutMs: options.requestTimeoutMs ?? 10000,
    };
  }

  /**
   * Validate a workspace path
   */
  async validatePath(path: string): Promise<Workspace> {
    return apiClient.post<Workspace>("workspace/validate", { path });
  }

  /**
   * Get recent workspaces
   */
  async getRecent(): Promise<Workspace[]> {
    if (this.isCacheValid()) {
      return this.cache!.recentWorkspaces!;
    }

    try {
      const workspaces = await apiClient.get<Workspace[]>("workspace/recent", {
        signal: AbortSignal.timeout(this.options.requestTimeoutMs),
      });

      this.cache = {
        recentWorkspaces: workspaces,
        timestamp: Date.now(),
      };

      return workspaces;
    } catch (error) {
      console.error("Failed to get recent workspaces:", error);

      if (this.cache?.recentWorkspaces) {
        return this.cache.recentWorkspaces;
      }

      throw error;
    }
  }

  /**
   * Add a workspace to recent list
   */
  async addRecent(path: string, metadata?: WorkspaceMetadata): Promise<void> {
    await apiClient.post("workspace/recent", { path, metadata });
    this.invalidateCache();
  }

  /**
   * Remove a workspace from recent list
   */
  async removeRecent(path: string): Promise<void> {
    const current = await this.getRecent();
    const filtered = current.filter((w) => w.path !== path);

    this.cache = {
      recentWorkspaces: filtered,
      timestamp: Date.now(),
    };
  }

  /**
   * Clear recent workspaces cache
   */
  async clearRecent(): Promise<void> {
    this.cache = null;
  }

  /**
   * Get path suggestions for workspace selection
   */
  async getPathSuggestions(): Promise<PathSuggestionsResponse> {
    return apiClient.get<PathSuggestionsResponse>("workspace/suggestions");
  }

  /**
   * Browse folder contents
   */
  async browseFolder(path?: string): Promise<BrowseFolderResponse> {
    return apiClient.post<BrowseFolderResponse>("workspace/browse-folder", {
      path,
    });
  }

  /**
   * Get combined workspace suggestions (path suggestions + recent workspaces)
   */
  async getCombinedSuggestions(): Promise<Workspace[]> {
    const [suggestionsResponse, recent] = await Promise.all([
      this.getPathSuggestions().catch(() => ({ suggestions: [] })),
      this.getRecent().catch(() => []),
    ]);

    const suggestionsAsWorkspaces: Workspace[] =
      suggestionsResponse.suggestions.map((s) => ({
        path: s.path,
        is_valid: true,
        workspace_name: s.name,
      }));

    const combined = [...suggestionsAsWorkspaces, ...recent];
    const unique = this.deduplicateByPath(combined);

    return unique.sort((a, b) => {
      const aRecent = recent.findIndex((w) => w.path === a.path);
      const bRecent = recent.findIndex((w) => w.path === b.path);

      if (aRecent !== -1 && bRecent !== -1) {
        return aRecent - bRecent;
      }
      if (aRecent !== -1) return -1;
      if (bRecent !== -1) return 1;

      return (a.workspace_name || "").localeCompare(b.workspace_name || "");
    });
  }

  /**
   * Check service health
   */
  async healthCheck(): Promise<{
    available: boolean;
    cacheValid: boolean;
    recentCount: number;
    latency?: number;
    error?: string;
  }> {
    const startTime = Date.now();

    try {
      await apiClient.get("workspace/recent", {
        signal: AbortSignal.timeout(2000),
      });

      const recent = this.cache?.recentWorkspaces || (await this.getRecent());

      return {
        available: true,
        cacheValid: this.isCacheValid(),
        recentCount: recent.length,
        latency: Date.now() - startTime,
      };
    } catch (error) {
      return {
        available: false,
        cacheValid: this.isCacheValid(),
        recentCount: this.cache?.recentWorkspaces?.length || 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // ===== Legacy method aliases for backward compatibility =====

  /** @deprecated Use validatePath instead */
  validateWorkspacePath = this.validatePath.bind(this);

  /** @deprecated Use getRecent instead */
  getRecentWorkspaces = this.getRecent.bind(this);

  /** @deprecated Use addRecent instead */
  addRecentWorkspace = this.addRecent.bind(this);

  /** @deprecated Use removeRecent instead */
  removeRecentWorkspace = this.removeRecent.bind(this);

  /** @deprecated Use clearRecent instead */
  clearRecentWorkspaces = this.clearRecent.bind(this);

  /** @deprecated Use getCombinedSuggestions instead */
  getWorkspaceSuggestions = this.getCombinedSuggestions.bind(this);

  /** @deprecated Use healthCheck instead */
  getHealthStatus = this.healthCheck.bind(this);

  /** @deprecated Not implemented in unified service */
  listWorkspaceFiles = async (_path: string): Promise<any[]> => {
    throw new Error("listWorkspaceFiles is not implemented in unified WorkspaceService");
  };

  // =============================================================

  private isCacheValid(): boolean {
    if (!this.cache) {
      return false;
    }

    const isExpired =
      Date.now() - this.cache.timestamp > this.options.cacheTimeoutMs;
    return !isExpired;
  }

  private invalidateCache(): void {
    this.cache = null;
  }

  private deduplicateByPath(workspaces: Workspace[]): Workspace[] {
    const seen = new Set<string>();
    return workspaces.filter((w) => {
      if (seen.has(w.path)) {
        return false;
      }
      seen.add(w.path);
      return true;
    });
  }
}

// Export singleton instance
export const workspaceService = new WorkspaceService();
