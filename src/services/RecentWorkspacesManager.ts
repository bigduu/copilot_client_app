/**
 * Recent Workspaces Manager Service
 * Manages workspace history through HTTP API with client-side caching and error handling
 */

import { buildBackendUrl } from "../utils/backendBaseUrl";

export interface WorkspaceInfo {
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

export interface RecentWorkspacesManagerOptions {
  maxRecentWorkspaces?: number;
  cacheTimeoutMs?: number;
  apiBaseUrl?: string;
  requestTimeoutMs?: number;
}

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
      cacheTimeoutMs: options.cacheTimeoutMs ?? 5 * 60 * 1000, // 5 minutes
      apiBaseUrl: "",
      requestTimeoutMs: options.requestTimeoutMs ?? 10000,
    };
  }

  private getApiBaseUrl(): string {
    return this.apiBaseUrlOverride ?? buildBackendUrl("/workspace");
  }

  /**
   * Get recent workspaces from cache or API
   */
  async getRecentWorkspaces(): Promise<WorkspaceInfo[]> {
    // Check cache first
    if (this.isCacheValid()) {
      return this.cache!.recentWorkspaces!;
    }

    try {
      const recentWorkspaces = await this.fetchRecentWorkspaces();

      // Update cache
      this.cache = {
        recentWorkspaces,
        timestamp: Date.now(),
      };

      return recentWorkspaces;
    } catch (error) {
      console.error('Failed to get recent workspaces:', error);

      // Return cached data if available, even if expired
      if (this.cache?.recentWorkspaces) {
        return this.cache.recentWorkspaces;
      }

      throw error;
    }
  }

  /**
   * Add a workspace to recent workspaces
   */
  async addRecentWorkspace(
    path: string,
    metadata?: WorkspaceMetadata
  ): Promise<void> {
    try {
      await this.addRecentWorkspaceToApi(path, metadata);

      // Invalidate cache to force refresh next time
      this.invalidateCache();
    } catch (error) {
      console.error('Failed to add recent workspace:', error);
      throw error;
    }
  }

  /**
   * Remove a workspace from recent workspaces
   */
  async removeRecentWorkspace(path: string): Promise<void> {
    try {
      // Note: This would require a DELETE endpoint in the API
      // For now, we'll just update the local cache
      const currentWorkspaces = await this.getRecentWorkspaces();
      const filteredWorkspaces = currentWorkspaces.filter(w => w.path !== path);

      // Update cache with filtered list
      this.cache = {
        recentWorkspaces: filteredWorkspaces,
        timestamp: Date.now(),
      };

      console.log(`Removed workspace from recent list: ${path}`);
    } catch (error) {
      console.error('Failed to remove recent workspace:', error);
      throw error;
    }
  }

  /**
   * Clear all recent workspaces
   */
  async clearRecentWorkspaces(): Promise<void> {
    try {
      // Note: This would require a DELETE endpoint in the API
      // For now, we'll just clear the local cache
      this.cache = null;

      console.log('Cleared recent workspaces cache');
    } catch (error) {
      console.error('Failed to clear recent workspaces:', error);
      throw error;
    }
  }

  /**
   * Get workspace suggestions based on recent workspaces and common directories
   */
  async getWorkspaceSuggestions(): Promise<WorkspaceInfo[]> {
    try {
      const suggestions = await this.fetchPathSuggestions();
      const recentWorkspaces = await this.getRecentWorkspaces();

      // Combine and deduplicate
      const allSuggestions = [...suggestions, ...recentWorkspaces];
      const uniqueSuggestions = this.deduplicateWorkspaces(allSuggestions);

      // Sort by relevance (recent first, then common directories)
      return uniqueSuggestions.sort((a, b) => {
        const aRecent = recentWorkspaces.findIndex(w => w.path === a.path);
        const bRecent = recentWorkspaces.findIndex(w => w.path === b.path);

        if (aRecent !== -1 && bRecent !== -1) {
          return aRecent - bRecent; // Both recent, sort by recency
        }
        if (aRecent !== -1) return -1; // A is recent, put first
        if (bRecent !== -1) return 1;  // B is recent, put first

        return (a.workspace_name || '').localeCompare(b.workspace_name || '');
      });
    } catch (error) {
      console.error('Failed to get workspace suggestions:', error);

      // Fallback to cached recent workspaces
      return this.getRecentWorkspaces();
    }
  }

  /**
   * Validate a workspace path
   */
  async validateWorkspacePath(path: string): Promise<WorkspaceInfo> {
    try {
      const response = await fetch(`${this.getApiBaseUrl()}/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path }),
        signal: AbortSignal.timeout(this.options.requestTimeoutMs),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result as WorkspaceInfo;
    } catch (error) {
      console.error(`Failed to validate workspace path '${path}':`, error);

      // Return a basic error result
      return {
        path,
        is_valid: false,
        error_message: error instanceof Error ? error.message : 'Validation failed',
      };
    }
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(): boolean {
    if (!this.cache) {
      return false;
    }

    const isExpired = Date.now() - this.cache.timestamp > this.options.cacheTimeoutMs;
    return !isExpired;
  }

  /**
   * Invalidate cache
   */
  private invalidateCache(): void {
    this.cache = null;
  }

  /**
   * Fetch recent workspaces from API
   */
  private async fetchRecentWorkspaces(): Promise<WorkspaceInfo[]> {
    const response = await fetch(`${this.getApiBaseUrl()}/recent`, {
      method: 'GET',
      signal: AbortSignal.timeout(this.options.requestTimeoutMs),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json() as Promise<WorkspaceInfo[]>;
  }

  /**
   * Add recent workspace to API
   */
  private async addRecentWorkspaceToApi(
    path: string,
    metadata?: WorkspaceMetadata
  ): Promise<void> {
    const response = await fetch(`${this.getApiBaseUrl()}/recent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path, metadata }),
      signal: AbortSignal.timeout(this.options.requestTimeoutMs),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  }

  /**
   * Fetch path suggestions from API
   */
  private async fetchPathSuggestions(): Promise<WorkspaceInfo[]> {
    const response = await fetch(`${this.getApiBaseUrl()}/suggestions`, {
      method: 'GET',
      signal: AbortSignal.timeout(this.options.requestTimeoutMs),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const suggestions = await response.json();

    // Convert API suggestions format to WorkspaceInfo format
    return suggestions.map((suggestion: any) => ({
      path: suggestion.path,
      is_valid: true, // Suggestions are assumed to be valid
      workspace_name: suggestion.name,
      error_message: undefined,
      file_count: undefined,
      last_modified: undefined,
      size_bytes: undefined,
    })) as WorkspaceInfo[];
  }

  /**
   * Remove duplicate workspaces
   */
  private deduplicateWorkspaces(workspaces: WorkspaceInfo[]): WorkspaceInfo[] {
    const seen = new Set<string>();
    return workspaces.filter(workspace => {
      if (seen.has(workspace.path)) {
        return false;
      }
      seen.add(workspace.path);
      return true;
    });
  }

  /**
   * Get health status of the workspace manager
   */
  async getHealthStatus(): Promise<{
    apiAvailable: boolean;
    cacheValid: boolean;
    recentCount: number;
  }> {
    try {
      // Test API availability
      const response = await fetch(`${this.getApiBaseUrl()}/recent`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });

      const apiAvailable = response.ok;
      const cacheValid = this.isCacheValid();
      const recentWorkspaces = cacheValid ? this.cache?.recentWorkspaces || [] : await this.getRecentWorkspaces();
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

// Singleton instance
export const recentWorkspacesManager = new RecentWorkspacesManager();

// Hook for React components
export function useRecentWorkspacesManager(options?: RecentWorkspacesManagerOptions) {
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
