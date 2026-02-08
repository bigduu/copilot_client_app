/**
 * @deprecated WorkspaceApiService has been unified. Use WorkspaceService from 'src/services/workspace' instead.
 */

import type { WorkspaceServiceOptions } from "../../../services/workspace";
import { WorkspaceService, workspaceService } from "../../../services/workspace";

export { WorkspaceService as WorkspaceApiService, workspaceService as workspaceApiService };

export type {
  Workspace as WorkspaceValidationResult,
  WorkspaceMetadata,
  PathSuggestion,
  PathSuggestionsResponse,
  BrowseFolderRequest,
  BrowseFolderResponse,
  ApiResponse,
  WorkspaceServiceOptions as WorkspaceApiServiceOptions,
  Workspace,
} from "../../../services/workspace";

// Helper function for creating service with options
export function useWorkspaceApiService(options?: WorkspaceServiceOptions) {
  return new WorkspaceService(options);
}
