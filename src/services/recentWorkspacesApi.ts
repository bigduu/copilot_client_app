import type { WorkspaceInfo, WorkspaceMetadata } from "./recentWorkspacesTypes";

export const fetchRecentWorkspaces = async (
  baseUrl: string,
  timeoutMs: number,
): Promise<WorkspaceInfo[]> => {
  const response = await fetch(`${baseUrl}/recent`, {
    method: "GET",
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json() as Promise<WorkspaceInfo[]>;
};

export const addRecentWorkspaceToApi = async (
  baseUrl: string,
  timeoutMs: number,
  path: string,
  metadata?: WorkspaceMetadata,
): Promise<void> => {
  const response = await fetch(`${baseUrl}/recent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path, metadata }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
};

export const fetchPathSuggestions = async (
  baseUrl: string,
  timeoutMs: number,
): Promise<WorkspaceInfo[]> => {
  const response = await fetch(`${baseUrl}/suggestions`, {
    method: "GET",
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const suggestions = await response.json();

  return suggestions.map((suggestion: any) => ({
    path: suggestion.path,
    is_valid: true,
    workspace_name: suggestion.name,
    error_message: undefined,
    file_count: undefined,
    last_modified: undefined,
    size_bytes: undefined,
  })) as WorkspaceInfo[];
};

export const validateWorkspacePath = async (
  baseUrl: string,
  timeoutMs: number,
  path: string,
): Promise<WorkspaceInfo> => {
  try {
    const response = await fetch(`${baseUrl}/validate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result as WorkspaceInfo;
  } catch (error) {
    console.error(`Failed to validate workspace path '${path}':`, error);

    return {
      path,
      is_valid: false,
      error_message:
        error instanceof Error ? error.message : "Validation failed",
    };
  }
};
