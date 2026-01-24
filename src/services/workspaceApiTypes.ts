export interface WorkspaceValidationResult {
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

export interface PathSuggestionsResponse {
  suggestions: PathSuggestion[];
}

export interface BrowseFolderRequest {
  path?: string;
}

export interface BrowseFolderResponse {
  current_path: string;
  parent_path?: string;
  folders: Array<{
    name: string;
    path: string;
  }>;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface WorkspaceApiServiceOptions {
  baseUrl?: string;
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  onRequest?: (url: string, options: RequestInit) => void;
  onResponse?: (url: string, response: Response) => void;
  onError?: (url: string, error: Error) => void;
}
