/**
 * @deprecated Workspace types have been unified. Import from 'src/services/workspace' instead.
 */

export type {
  Workspace as WorkspaceInfo,
  WorkspaceMetadata,
  WorkspaceServiceOptions as RecentWorkspacesManagerOptions,
} from "../../../services/workspace";

// Also export Workspace itself
export type { Workspace } from "../../../services/workspace";
