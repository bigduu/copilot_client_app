/**
 * @deprecated Workspace types have been unified. Import from 'src/services/workspace' instead.
 */

export type {
  Workspace as WorkspaceValidationResult,
  WorkspaceMetadata,
  PathSuggestion,
  PathSuggestionsResponse,
  BrowseFolderRequest,
  BrowseFolderResponse,
  ApiResponse,
  WorkspaceServiceOptions as WorkspaceApiServiceOptions,
} from "../../../services/workspace";

// Also export Workspace itself
export type { Workspace } from "../../../services/workspace";
