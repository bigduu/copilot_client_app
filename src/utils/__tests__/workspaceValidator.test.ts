import { describe, expect, it, beforeEach, vi } from "vitest";
import { workspaceValidator, useWorkspaceValidator, WorkspaceValidationResult } from '../workspaceValidator';

// Mock fetch globally
global.fetch = vi.fn();

// Mock console methods to reduce test noise
global.console = {
  ...console,
  warn: vi.fn(),
  error: vi.fn(),
};

describe('WorkspaceValidator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceValidator.clearCache();
  });

  describe('validateWorkspace', () => {
    it('should return error for empty path', async () => {
      const result = await workspaceValidator.validateWorkspace('');

      expect(result).toEqual({
        path: '',
        is_valid: false,
        error_message: 'Path cannot be empty',
      });
    });

    it('should return error for whitespace-only path', async () => {
      const result = await workspaceValidator.validateWorkspace('   \t  ');

      expect(result).toEqual({
        path: '',
        is_valid: false,
        error_message: 'Path cannot be empty',
      });
    });

    it('should make API call for valid path', async () => {
      const mockResult: WorkspaceValidationResult = {
        path: '/valid/workspace',
        is_valid: true,
        file_count: 10,
        workspace_name: 'workspace',
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
      });

      const result = await workspaceValidator.validateWorkspace('/valid/workspace');

      expect(fetch).toHaveBeenCalledWith('http://localhost:8080/v1/workspace/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: '/valid/workspace' }),
      });

      expect(result).toEqual(mockResult);
    });

    it('should handle API errors', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(workspaceValidator.validateWorkspace('/invalid/path')).rejects.toThrow();
    });

    it('should use cached results', async () => {
      const mockResult: WorkspaceValidationResult = {
        path: '/cached/workspace',
        is_valid: true,
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
      });

      // First call
      const result1 = await workspaceValidator.validateWorkspace('/cached/workspace');
      expect(fetch).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result2 = await workspaceValidator.validateWorkspace('/cached/workspace');
      expect(fetch).toHaveBeenCalledTimes(1); // No additional calls

      expect(result1).toEqual(result2);
    });
  });

  describe('validateWorkspaceDebounced', () => {
    it('should debounce validation calls', async () => {
      const mockResult: WorkspaceValidationResult = {
        path: '/debounced/workspace',
        is_valid: true,
      };

      (fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResult,
      });

      const callback = vi.fn();

      // Multiple rapid calls
      workspaceValidator.validateWorkspaceDebounced('/debounced/workspace', callback);
      workspaceValidator.validateWorkspaceDebounced('/debounced/workspace', callback);
      workspaceValidator.validateWorkspaceDebounced('/debounced/workspace', callback);

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 350));

      expect(callback).toHaveBeenCalledTimes(3);
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('validateMultiplePaths', () => {
    it('should validate multiple paths in batches', async () => {
      const mockResults: WorkspaceValidationResult[] = [
        { path: '/path1', is_valid: true },
        { path: '/path2', is_valid: false, error_message: 'Invalid' },
        { path: '/path3', is_valid: true },
      ];

      (fetch as any).mockImplementation((_url: string, options: any) => {
        const parsedPath = JSON.parse(options.body).path;
        return Promise.resolve({
          ok: true,
          json: async () => mockResults.find(r => r.path === parsedPath),
        });
      });

      const results = await workspaceValidator.validateMultiplePaths(['/path1', '/path2', '/path3']);

      expect(results).toEqual(mockResults);
      expect(fetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('cache management', () => {
    it('should clear cache', async () => {
      const mockResult: WorkspaceValidationResult = {
        path: '/cache/workspace',
        is_valid: true,
      };

      (fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResult,
      });

      // First call to populate cache
      await workspaceValidator.validateWorkspace('/cache/workspace');
      expect(fetch).toHaveBeenCalledTimes(1);

      // Clear cache
      workspaceValidator.clearCache();

      // Second call should make new API request
      await workspaceValidator.validateWorkspace('/cache/workspace');
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });
});

describe('useWorkspaceValidator', () => {
  it('should return validator functions', () => {
    const validator = useWorkspaceValidator();

    expect(typeof validator.validateWorkspace).toBe('function');
    expect(typeof validator.validateWorkspaceDebounced).toBe('function');
    expect(typeof validator.validateMultiplePaths).toBe('function');
    expect(typeof validator.clearCache).toBe('function');
  });

  it('should accept custom options', () => {
    const customOptions = {
      debounceMs: 500,
      cacheTimeoutMs: 10000,
      maxRetries: 5,
    };

    const validator = useWorkspaceValidator(customOptions);

    expect(typeof validator.validateWorkspace).toBe('function');
  });
});
