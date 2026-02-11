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
  WorkspaceFileEntry,
  WorkspaceFilesRequest,
  ApiResponse,
  WorkspaceServiceOptions,
  // Legacy aliases
  WorkspaceValidationResult,
  WorkspaceInfo,
} from "./types";
