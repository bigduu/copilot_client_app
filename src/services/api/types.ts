/**
 * Common API Types
 *
 * Shared types used across API requests and responses.
 */

export interface ApiListResponse<T> {
  items: T[];
  total: number;
}

export interface ApiPaginationParams {
  page?: number;
  page_size?: number;
}

export interface ApiFilterParams {
  search?: string;
  sort_by?: string;
  sort_order?: "asc" | "desc";
}

// Re-export commonly used types from feature modules
export * from "../chat/AgentService";
