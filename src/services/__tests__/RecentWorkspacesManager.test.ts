import { describe, expect, it, beforeEach, vi } from "vitest";
import { recentWorkspacesManager, useRecentWorkspacesManager, WorkspaceInfo } from '../RecentWorkspacesManager';

// Mock fetch globally
global.fetch = vi.fn();

// Mock AbortSignal.timeout for older environments
if (!global.AbortSignal.timeout) {
  global.AbortSignal.timeout = vi.fn(() => new AbortController().signal);
}

// Mock console methods
global.console = {
  ...console,
  warn: vi.fn(),
  error: vi.fn(),
};

describe('RecentWorkspacesManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset singleton state by creating a new instance
    (recentWorkspacesManager as any).cache = null;
  });

  describe('getRecentWorkspaces', () => {
    it('should fetch recent workspaces from API', async () => {
      const mockWorkspaces: WorkspaceInfo[] = [
        { path: '/workspace1', is_valid: true, workspace_name: 'workspace1' },
        { path: '/workspace2', is_valid: true, workspace_name: 'workspace2' },
      ];

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockWorkspaces,
      });

      const result = await recentWorkspacesManager.getRecentWorkspaces();

      expect(fetch).toHaveBeenCalledWith('/v1/workspace/recent', {
        method: 'GET',
        signal: expect.any(AbortSignal),
      });

      expect(result).toEqual(mockWorkspaces);
    });

    it('should use cached results when available', async () => {
      const mockWorkspaces: WorkspaceInfo[] = [
        { path: '/cached/workspace', is_valid: true },
      ];

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockWorkspaces,
      });

      // First call
      const result1 = await recentWorkspacesManager.getRecentWorkspaces();
      expect(fetch).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result2 = await recentWorkspacesManager.getRecentWorkspaces();
      expect(fetch).toHaveBeenCalledTimes(1);

      expect(result1).toEqual(result2);
    });
  });

  describe('addRecentWorkspace', () => {
    it('should add workspace via API', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await recentWorkspacesManager.addRecentWorkspace('/new/workspace', {
        workspace_name: 'new-workspace',
      });

      expect(fetch).toHaveBeenCalledWith('/v1/workspace/recent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: '/new/workspace',
          metadata: { workspace_name: 'new-workspace' },
        }),
        signal: expect.any(AbortSignal),
      });
    });
  });

  describe('validateWorkspacePath', () => {
    it('should validate workspace path via API', async () => {
      const mockValidation: WorkspaceInfo = {
        path: '/valid/workspace',
        is_valid: true,
        file_count: 10,
        workspace_name: 'workspace',
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockValidation,
      });

      const result = await recentWorkspacesManager.validateWorkspacePath('/valid/workspace');

      expect(fetch).toHaveBeenCalledWith('/v1/workspace/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: '/valid/workspace' }),
        signal: expect.any(AbortSignal),
      });

      expect(result).toEqual(mockValidation);
    });

    it('should handle validation errors gracefully', async () => {
      (fetch as any).mockRejectedValueOnce(
        new Error('Validation failed')
      );

      const result = await recentWorkspacesManager.validateWorkspacePath('/invalid/workspace');

      expect(result).toEqual({
        path: '/invalid/workspace',
        is_valid: false,
        error_message: 'Validation failed',
      });
    });
  });

  describe('getHealthStatus', () => {
    it('should return healthy status when API is available', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const status = await recentWorkspacesManager.getHealthStatus();

      expect(status).toEqual({
        apiAvailable: true,
        cacheValid: false,
        recentCount: 0,
      });
    });

    it('should return unhealthy status when API is unavailable', async () => {
      (fetch as any).mockRejectedValueOnce(
        new Error('API unavailable')
      );

      const status = await recentWorkspacesManager.getHealthStatus();

      expect(status).toEqual({
        apiAvailable: false,
        cacheValid: false,
        recentCount: 0,
      });
    });
  });
});

describe('useRecentWorkspacesManager', () => {
  it('should return manager functions', () => {
    const manager = useRecentWorkspacesManager();

    expect(typeof manager.getRecentWorkspaces).toBe('function');
    expect(typeof manager.addRecentWorkspace).toBe('function');
    expect(typeof manager.removeRecentWorkspace).toBe('function');
    expect(typeof manager.clearRecentWorkspaces).toBe('function');
    expect(typeof manager.getWorkspaceSuggestions).toBe('function');
    expect(typeof manager.validateWorkspacePath).toBe('function');
    expect(typeof manager.getHealthStatus).toBe('function');
  });

  it('should accept custom options', () => {
    const customOptions = {
      maxRecentWorkspaces: 20,
      cacheTimeoutMs: 60000,
      apiBaseUrl: '/custom/api',
      requestTimeoutMs: 5000,
    };

    const manager = useRecentWorkspacesManager(customOptions);

    expect(typeof manager.getRecentWorkspaces).toBe('function');
  });
});