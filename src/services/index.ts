/**
 * Unified Services Layer
 *
 * All backend API services are organized by domain:
 * - api/      - HTTP client and base types
 * - agent/    - Agent-related services
 * - chat/     - Chat-related services
 * - skill/    - Skill management
 * - tool/     - Tool execution
 * - workspace/- Workspace management
 */

// API Client (unified HTTP layer)
export {
  ApiClient,
  apiClient,
  ApiError,
  isApiError,
  getErrorMessage,
  withFallback,
} from "./api";
export type {
  ApiClientConfig,
  ErrorResponse,
  ApiListResponse,
  ApiPaginationParams,
  ApiFilterParams,
} from "./api";

// Skill Service
export { SkillService, skillService } from "./skill/SkillService";
export type {
  SkillDefinition,
  SkillFilter,
  SkillListResponse,
  SkillVisibility,
} from "./skill/types";

// Tool Service
export { ToolService, toolService } from "./tool/ToolService";
export type {
  ToolCallRequest,
  ToolExecutionRequest,
  ToolExecutionResult,
  ParameterValue,
  ToolUIInfo,
  ParameterInfo,
  ToolsUIResponse,
  ValidationResult,
} from "./tool/ToolService";

// Workspace Service
export { WorkspaceService, workspaceService } from "./workspace";
export type {
  Workspace,
  WorkspaceMetadata,
  PathSuggestion,
  PathSuggestionsResponse,
  BrowseFolderRequest,
  BrowseFolderResponse,
  WorkspaceServiceOptions,
  // Legacy aliases
  WorkspaceValidationResult,
  WorkspaceInfo,
} from "./workspace";
