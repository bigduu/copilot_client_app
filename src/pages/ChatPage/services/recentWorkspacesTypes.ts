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
