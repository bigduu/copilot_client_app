/**
 * Unified API Client
 *
 * Centralized HTTP client for all backend API communication.
 */

export { ApiClient, apiClient } from "./client";
export type { ApiClientConfig } from "./client";

export { ApiError, isApiError, getErrorMessage, withFallback } from "./errors";
export type { ErrorResponse } from "./errors";

export * from "./types";
