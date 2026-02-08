/**
 * @deprecated RecentWorkspacesManager has been unified. Use WorkspaceService from 'src/services/workspace' instead.
 */

import type { WorkspaceServiceOptions } from "../../../services/workspace";
import { WorkspaceService, workspaceService } from "../../../services/workspace";

export { WorkspaceService as RecentWorkspacesManager, workspaceService as recentWorkspacesManager };

export type {
  Workspace as WorkspaceInfo,
  WorkspaceMetadata,
  WorkspaceServiceOptions as RecentWorkspacesManagerOptions,
  Workspace,
} from "../../../services/workspace";

// Helper function for creating manager with options
export function useRecentWorkspacesManager(options?: WorkspaceServiceOptions) {
  const service = new WorkspaceService(options);

  // Provide interface compatibility with old RecentWorkspacesManager
  return {
    getRecentWorkspaces: service.getRecent.bind(service),
    addRecentWorkspace: service.addRecent.bind(service),
    removeRecentWorkspace: service.removeRecent.bind(service),
    clearRecentWorkspaces: service.clearRecent.bind(service),
    getWorkspaceSuggestions: service.getCombinedSuggestions.bind(service),
    validateWorkspacePath: service.validatePath.bind(service),
    getHealthStatus: service.healthCheck.bind(service),
  };
}
