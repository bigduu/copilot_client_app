/**
 * API Error Handling
 *
 * Provides standardized error handling for API requests.
 */

import { ApiError } from "./client";

export { ApiError } from "./client";

export interface ErrorResponse {
  error: string;
  message?: string;
  code?: string;
}

/**
 * Check if error is an API error
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Get user-friendly error message from API error
 */
export function getErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.status === 401) {
      return "Authentication failed. Please check your credentials.";
    }
    if (error.status === 403) {
      return "You don't have permission to perform this action.";
    }
    if (error.status === 404) {
      return "The requested resource was not found.";
    }
    if (error.status >= 500) {
      return "Server error. Please try again later.";
    }
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected error occurred";
}

/**
 * Handle API error with fallback value
 */
export async function withFallback<T>(
  promise: Promise<T>,
  fallback: T,
  onError?: (error: ApiError) => void
): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (isApiError(error) && onError) {
      onError(error);
    }
    return fallback;
  }
}
