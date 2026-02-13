export type MetricsGranularity = "daily" | "weekly" | "monthly";

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface MetricsSummary {
  total_sessions: number;
  total_tokens: TokenUsage;
  total_tool_calls: number;
  active_sessions: number;
}

export interface ModelMetrics {
  model: string;
  sessions: number;
  rounds: number;
  tokens: TokenUsage;
  tool_calls: number;
}

export type SessionStatus = "running" | "completed" | "error" | "cancelled";

export interface SessionMetrics {
  session_id: string;
  model: string;
  started_at: string;
  completed_at?: string | null;
  total_rounds: number;
  total_token_usage: TokenUsage;
  tool_call_count: number;
  tool_breakdown: Record<string, number>;
  status: SessionStatus;
  message_count: number;
  duration_ms?: number | null;
}

export interface ToolCallMetrics {
  tool_call_id: string;
  tool_name: string;
  started_at: string;
  completed_at?: string | null;
  success?: boolean | null;
  error?: string | null;
  duration_ms?: number | null;
}

export type RoundStatus = "running" | "success" | "error" | "cancelled";

export interface RoundMetrics {
  round_id: string;
  session_id: string;
  model: string;
  started_at: string;
  completed_at?: string | null;
  token_usage: TokenUsage;
  tool_calls: ToolCallMetrics[];
  status: RoundStatus;
  error?: string | null;
  duration_ms?: number | null;
}

export interface SessionDetail {
  session: SessionMetrics;
  rounds: RoundMetrics[];
}

export interface DailyMetrics {
  date: string;
  total_sessions: number;
  total_rounds: number;
  total_token_usage: TokenUsage;
  total_tool_calls: number;
  model_breakdown: Record<string, TokenUsage>;
  tool_breakdown: Record<string, number>;
}

export interface PeriodMetrics {
  label: string;
  period_start: string;
  period_end: string;
  total_sessions: number;
  total_rounds: number;
  total_token_usage: TokenUsage;
  total_tool_calls: number;
  model_breakdown: Record<string, TokenUsage>;
  tool_breakdown: Record<string, number>;
}

export interface MetricsDateRange {
  startDate?: string;
  endDate?: string;
}

export interface MetricsSessionQuery extends MetricsDateRange {
  model?: string;
  limit?: number;
}

export interface MetricsDailyQuery {
  days?: number;
  endDate?: string;
  granularity?: MetricsGranularity;
}

// Forward metrics types
export type ForwardStatus = "success" | "error";

export interface ForwardMetricsSummary {
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  total_tokens: TokenUsage;
  avg_duration_ms?: number | null;
}

export interface ForwardEndpointMetrics {
  endpoint: string;
  requests: number;
  successful: number;
  failed: number;
  tokens: TokenUsage;
  avg_duration_ms?: number | null;
}

export interface ForwardRequestMetrics {
  forward_id: string;
  endpoint: string;
  model: string;
  is_stream: boolean;
  started_at: string;
  completed_at?: string | null;
  status_code?: number | null;
  status?: ForwardStatus | null;
  token_usage?: TokenUsage | null;
  error?: string | null;
  duration_ms?: number | null;
}

export interface ForwardMetricsQuery {
  startDate?: string;
  endDate?: string;
  endpoint?: string;
  model?: string;
  limit?: number;
}

// Unified API types (v2)
export interface UnifiedSummary {
  chat: MetricsSummary;
  forward: ForwardMetricsSummary;
  combined: CombinedSummary;
}

export interface CombinedSummary {
  total_requests: number;
  total_tokens: number;
  total_success: number;
  total_errors: number;
  success_rate: number;
}

export interface UnifiedTimelinePoint {
  date: string;
  chat_tokens: number;
  chat_sessions: number;
  forward_tokens: number;
  forward_requests: number;
  total_tokens: number;
}

