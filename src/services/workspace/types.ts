/**
 * Workspace Types
 *
 * Unified workspace type definitions.
 * Merged from workspaceApiTypes.ts and recentWorkspacesTypes.ts
 */

/**
 * Workspace information - unified type replacing WorkspaceValidationResult and WorkspaceInfo
 */
export interface Workspace {
  path: string;
  is_valid: boolean;
  error_message?: string;
  file_count?: number;
  last_modified?: string;
  size_bytes?: number;
  workspace_name?: string;
}

/**
 * Workspace metadata
 */
export interface WorkspaceMetadata {
  workspace_name?: string;
  description?: string;
  tags?: string[];
}

/**
 * Path suggestion for workspace selection
 */
export interface PathSuggestion {
  path: string;
  name: string;
  description?: string;
  suggestion_type:
    | "recent"
    | "common"
    | "home"
    | "documents"
    | "desktop"
    | "downloads";
}

/**
 * Path suggestions response
 */
export interface PathSuggestionsResponse {
  suggestions: PathSuggestion[];
}

/**
 * Browse folder request
 */
export interface BrowseFolderRequest {
  path?: string;
}

/**
 * Browse folder response
 */
export interface BrowseFolderResponse {
  current_path: string;
  parent_path?: string;
  folders: Array<{
    name: string;
    path: string;
  }>;
}

/**
 * Generic API response
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Workspace service options
 */
export interface WorkspaceServiceOptions {
  maxRecentWorkspaces?: number;
  cacheTimeoutMs?: number;
  requestTimeoutMs?: number;
  // Legacy options for backward compatibility
  /** @deprecated Not used in unified service */
  apiBaseUrl?: string;
  /** @deprecated Not used in unified service */
  baseUrl?: string;
  /** @deprecated Not used in unified service */
  timeoutMs?: number;
  /** @deprecated Not used in unified service */
  retries?: number;
  /** @deprecated Not used in unified service */
  headers?: Record<string, string>;
}

// Legacy type aliases for backward compatibility
/** @deprecated Use Workspace instead */
export type WorkspaceValidationResult = Workspace;
/** @deprecated Use Workspace instead */
export type WorkspaceInfo = Workspace;
