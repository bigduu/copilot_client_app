/**
 * Unified Services Layer
 *
 * All backend API services are organized by domain:
 * - api/      - HTTP client and base types
 * - agent/    - Agent-related services
 * - chat/     - Chat-related services
 * - skill/    - Skill management
 * - mcp/      - MCP server and tool management
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

// MCP Service
export { McpService, mcpService } from "./mcp";
export type {
  HeaderConfig,
  McpActionResponse,
  McpServer,
  McpServerApiRecord,
  McpServerConfig,
  McpTool,
  McpToolInfo,
  ReconnectConfig,
  RuntimeInfo,
  ServerListResponse,
  ToolListResponse,
  TransportConfig,
  SseTransportConfig,
  StdioTransportConfig,
} from "./mcp";
export {
  createDefaultMcpServerConfig,
  createDefaultRuntimeInfo,
  DEFAULT_HEALTHCHECK_INTERVAL_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_SSE_CONNECT_TIMEOUT_MS,
  DEFAULT_STDIO_STARTUP_TIMEOUT_MS,
  ServerStatus,
} from "./mcp";

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


// Metrics Service
export { MetricsService, metricsService } from "./metrics";
export type {
  DailyMetrics,
  MetricsDailyQuery,
  MetricsDateRange,
  MetricsGranularity,
  MetricsSessionQuery,
  MetricsSummary,
  ModelMetrics,
  PeriodMetrics,
  RoundMetrics,
  RoundStatus,
  SessionDetail,
  SessionMetrics,
  SessionStatus,
  TokenUsage,
  ToolCallMetrics,
} from "./metrics";

// Settings Service
export { SettingsService, settingsService } from "./config/SettingsService";
