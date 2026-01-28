import { buildBackendUrl } from "../../../shared/utils/backendBaseUrl";
import type {
  RecentWorkspacesManagerOptions,
  WorkspaceInfo,
  WorkspaceMetadata,
} from "./recentWorkspacesTypes";
import {
  addRecentWorkspaceToApi,
  fetchPathSuggestions,
  fetchRecentWorkspaces,
  validateWorkspacePath,
} from "./recentWorkspacesApi";
import { deduplicateWorkspaces } from "./recentWorkspacesUtils";

export type {
  RecentWorkspacesManagerOptions,
  WorkspaceInfo,
  WorkspaceMetadata,
} from "./recentWorkspacesTypes";

class RecentWorkspacesManager {
  private cache: {
    recentWorkspaces: WorkspaceInfo[] | null;
    timestamp: number;
  } | null = null;
  private options: Required<RecentWorkspacesManagerOptions>;
  private apiBaseUrlOverride: string | null;

  constructor(options: RecentWorkspacesManagerOptions = {}) {
    this.apiBaseUrlOverride = options.apiBaseUrl
      ? options.apiBaseUrl.replace(/\/+$/, "")
      : null;

    this.options = {
      maxRecentWorkspaces: options.maxRecentWorkspaces ?? 10,
      cacheTimeoutMs: options.cacheTimeoutMs ?? 5 * 60 * 1000,
      apiBaseUrl: "",
      requestTimeoutMs: options.requestTimeoutMs ?? 10000,
    };
  }

  private getApiBaseUrl(): string {
    return this.apiBaseUrlOverride ?? buildBackendUrl("/workspace");
  }

  async getRecentWorkspaces(): Promise<WorkspaceInfo[]> {
    if (this.isCacheValid()) {
      return this.cache!.recentWorkspaces!;
    }

    try {
      const recentWorkspaces = await fetchRecentWorkspaces(
        this.getApiBaseUrl(),
        this.options.requestTimeoutMs,
      );

      this.cache = {
        recentWorkspaces,
        timestamp: Date.now(),
      };

      return recentWorkspaces;
    } catch (error) {
      console.error("Failed to get recent workspaces:", error);

      if (this.cache?.recentWorkspaces) {
        return this.cache.recentWorkspaces;
      }

      throw error;
    }
  }

  async addRecentWorkspace(
    path: string,
    metadata?: WorkspaceMetadata,
  ): Promise<void> {
    try {
      await addRecentWorkspaceToApi(
        this.getApiBaseUrl(),
        this.options.requestTimeoutMs,
        path,
        metadata,
      );

      this.invalidateCache();
    } catch (error) {
      console.error("Failed to add recent workspace:", error);
      throw error;
    }
  }

  async removeRecentWorkspace(path: string): Promise<void> {
    try {
      const currentWorkspaces = await this.getRecentWorkspaces();
      const filteredWorkspaces = currentWorkspaces.filter(
        (w) => w.path !== path,
      );

      this.cache = {
        recentWorkspaces: filteredWorkspaces,
        timestamp: Date.now(),
      };

      console.log(`Removed workspace from recent list: ${path}`);
    } catch (error) {
      console.error("Failed to remove recent workspace:", error);
      throw error;
    }
  }

  async clearRecentWorkspaces(): Promise<void> {
    try {
      this.cache = null;
      console.log("Cleared recent workspaces cache");
    } catch (error) {
      console.error("Failed to clear recent workspaces:", error);
      throw error;
    }
  }

  async getWorkspaceSuggestions(): Promise<WorkspaceInfo[]> {
    try {
      const suggestions = await fetchPathSuggestions(
        this.getApiBaseUrl(),
        this.options.requestTimeoutMs,
      );
      const recentWorkspaces = await this.getRecentWorkspaces();

      const allSuggestions = [...suggestions, ...recentWorkspaces];
      const uniqueSuggestions = deduplicateWorkspaces(allSuggestions);

      return uniqueSuggestions.sort((a, b) => {
        const aRecent = recentWorkspaces.findIndex((w) => w.path === a.path);
        const bRecent = recentWorkspaces.findIndex((w) => w.path === b.path);

        if (aRecent !== -1 && bRecent !== -1) {
          return aRecent - bRecent;
        }
        if (aRecent !== -1) return -1;
        if (bRecent !== -1) return 1;

        return (a.workspace_name || "").localeCompare(b.workspace_name || "");
      });
    } catch (error) {
      console.error("Failed to get workspace suggestions:", error);
      return this.getRecentWorkspaces();
    }
  }

  async validateWorkspacePath(path: string): Promise<WorkspaceInfo> {
    return validateWorkspacePath(
      this.getApiBaseUrl(),
      this.options.requestTimeoutMs,
      path,
    );
  }

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

  async getHealthStatus(): Promise<{
    apiAvailable: boolean;
    cacheValid: boolean;
    recentCount: number;
  }> {
    try {
      const response = await fetch(`${this.getApiBaseUrl()}/recent`, {
        method: "GET",
        signal: AbortSignal.timeout(2000),
      });

      const apiAvailable = response.ok;
      const cacheValid = this.isCacheValid();
      const recentWorkspaces = cacheValid
        ? this.cache?.recentWorkspaces || []
        : await this.getRecentWorkspaces();
      const recentCount = recentWorkspaces.length;

      return {
        apiAvailable,
        cacheValid,
        recentCount,
      };
    } catch (error) {
      return {
        apiAvailable: false,
        cacheValid: this.isCacheValid(),
        recentCount: this.cache?.recentWorkspaces?.length || 0,
      };
    }
  }
}

export const recentWorkspacesManager = new RecentWorkspacesManager();

export function useRecentWorkspacesManager(
  options?: RecentWorkspacesManagerOptions,
) {
  const manager = new RecentWorkspacesManager(options);

  return {
    getRecentWorkspaces: manager.getRecentWorkspaces.bind(manager),
    addRecentWorkspace: manager.addRecentWorkspace.bind(manager),
    removeRecentWorkspace: manager.removeRecentWorkspace.bind(manager),
    clearRecentWorkspaces: manager.clearRecentWorkspaces.bind(manager),
    getWorkspaceSuggestions: manager.getWorkspaceSuggestions.bind(manager),
    validateWorkspacePath: manager.validateWorkspacePath.bind(manager),
    getHealthStatus: manager.getHealthStatus.bind(manager),
  };
}

export default recentWorkspacesManager;
