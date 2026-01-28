/**
 * Workspace validation utility with HTTP API integration
 * Provides real-time validation, debouncing, and caching for workspace paths
 */

import { buildBackendUrl } from "../../../shared/utils/backendBaseUrl";

export interface WorkspaceValidationResult {
  path: string;
  is_valid: boolean;
  error_message?: string;
  file_count?: number;
  last_modified?: string;
  size_bytes?: number;
  workspace_name?: string;
}

export interface ValidationState {
  isValidating: boolean;
  lastResult: WorkspaceValidationResult | null;
  error: string | null;
}

export interface WorkspaceValidatorOptions {
  debounceMs?: number;
  cacheTimeoutMs?: number;
  maxRetries?: number;
}

class WorkspaceValidator {
  private cache = new Map<
    string,
    { result: WorkspaceValidationResult; timestamp: number }
  >();
  private pendingValidations = new Map<
    string,
    Promise<WorkspaceValidationResult>
  >();
  private options: Required<WorkspaceValidatorOptions>;

  constructor(options: WorkspaceValidatorOptions = {}) {
    this.options = {
      debounceMs: options.debounceMs ?? 300,
      cacheTimeoutMs: options.cacheTimeoutMs ?? 5 * 60 * 1000, // 5 minutes
      maxRetries: options.maxRetries ?? 3,
    };
  }

  /**
   * Validate a workspace path with debouncing and caching
   */
  async validateWorkspace(path: string): Promise<WorkspaceValidationResult> {
    if (!path || path.trim().length === 0) {
      return {
        path: "",
        is_valid: false,
        error_message: "Path cannot be empty",
      };
    }

    const normalizedPath = path.trim();

    // Check cache first
    const cached = this.getCachedResult(normalizedPath);
    if (cached) {
      return cached;
    }

    // Check if validation is already in progress
    const pending = this.pendingValidations.get(normalizedPath);
    if (pending) {
      return pending;
    }

    // Start new validation
    const validationPromise = this.performValidation(normalizedPath);
    this.pendingValidations.set(normalizedPath, validationPromise);

    try {
      const result = await validationPromise;
      this.setCachedResult(normalizedPath, result);
      return result;
    } finally {
      this.pendingValidations.delete(normalizedPath);
    }
  }

  /**
   * Validate a workspace path with debouncing
   */
  validateWorkspaceDebounced(
    path: string,
    callback: (result: WorkspaceValidationResult) => void,
  ): () => void {
    let timeoutId: NodeJS.Timeout;

    const debouncedValidation = async () => {
      try {
        const result = await this.validateWorkspace(path);
        callback(result);
      } catch (error) {
        const errorResult: WorkspaceValidationResult = {
          path,
          is_valid: false,
          error_message:
            error instanceof Error ? error.message : "Validation failed",
        };
        callback(errorResult);
      }
    };

    timeoutId = setTimeout(debouncedValidation, this.options.debounceMs);

    // Return cancel function
    return () => {
      clearTimeout(timeoutId);
    };
  }

  /**
   * Clear the validation cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cached result if still valid
   */
  private getCachedResult(path: string): WorkspaceValidationResult | null {
    const cached = this.cache.get(path);
    if (!cached) {
      return null;
    }

    const isExpired =
      Date.now() - cached.timestamp > this.options.cacheTimeoutMs;
    if (isExpired) {
      this.cache.delete(path);
      return null;
    }

    return cached.result;
  }

  /**
   * Set cached result
   */
  private setCachedResult(
    path: string,
    result: WorkspaceValidationResult,
  ): void {
    this.cache.set(path, {
      result,
      timestamp: Date.now(),
    });
  }

  /**
   * Perform the actual validation via HTTP API
   */
  private async performValidation(
    path: string,
    retryCount = 0,
  ): Promise<WorkspaceValidationResult> {
    try {
      const response = await fetch(buildBackendUrl("/workspace/validate"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result as WorkspaceValidationResult;
    } catch (error) {
      // Retry logic
      if (
        retryCount < this.options.maxRetries &&
        this.isRetryableError(error)
      ) {
        await this.delay(Math.pow(2, retryCount) * 1000); // Exponential backoff
        return this.performValidation(path, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      // Retry on network errors and 5xx server errors
      return (
        error.message.includes("Failed to fetch") ||
        error.message.includes("HTTP error! status: 5")
      );
    }
    return false;
  }

  /**
   * Utility function for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Validate multiple paths in parallel (with rate limiting)
   */
  async validateMultiplePaths(
    paths: string[],
  ): Promise<WorkspaceValidationResult[]> {
    const BATCH_SIZE = 5; // Limit concurrent requests
    const results: WorkspaceValidationResult[] = [];

    for (let i = 0; i < paths.length; i += BATCH_SIZE) {
      const batch = paths.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map((path) => this.validateWorkspace(path)),
      );
      results.push(...batchResults);

      // Small delay between batches to avoid overwhelming the server
      if (i + BATCH_SIZE < paths.length) {
        await this.delay(100);
      }
    }

    return results;
  }
}

// Singleton instance
export const workspaceValidator = new WorkspaceValidator();

// Hook for React components
export function useWorkspaceValidator(options?: WorkspaceValidatorOptions) {
  const validator = new WorkspaceValidator(options);

  return {
    validateWorkspace: validator.validateWorkspace.bind(validator),
    validateWorkspaceDebounced:
      validator.validateWorkspaceDebounced.bind(validator),
    validateMultiplePaths: validator.validateMultiplePaths.bind(validator),
    clearCache: validator.clearCache.bind(validator),
  };
}

export default workspaceValidator;
