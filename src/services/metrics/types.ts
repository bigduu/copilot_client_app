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
