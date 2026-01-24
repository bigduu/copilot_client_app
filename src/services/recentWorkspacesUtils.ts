import type { WorkspaceInfo } from "./recentWorkspacesTypes";

export const deduplicateWorkspaces = (
  workspaces: WorkspaceInfo[],
): WorkspaceInfo[] => {
  const seen = new Set<string>();
  return workspaces.filter((workspace) => {
    if (seen.has(workspace.path)) {
      return false;
    }
    seen.add(workspace.path);
    return true;
  });
};
