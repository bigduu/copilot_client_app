/**
 * Workspace Service Module
 *
 * Unified workspace management functionality.
 */

export { WorkspaceService, workspaceService } from "./WorkspaceService";

export type {
  Workspace,
  WorkspaceMetadata,
  PathSuggestion,
  PathSuggestionsResponse,
  BrowseFolderRequest,
  BrowseFolderResponse,
  ApiResponse,
  WorkspaceServiceOptions,
  // Legacy aliases
  WorkspaceValidationResult,
  WorkspaceInfo,
} from "./types";
