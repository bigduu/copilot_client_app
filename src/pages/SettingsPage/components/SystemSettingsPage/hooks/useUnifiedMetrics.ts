import { useCallback, useEffect, useMemo, useState } from "react";

import { metricsService } from "../../../../../services/metrics";
import type {
  CombinedSummary,
  ForwardEndpointMetrics,
  ForwardMetricsQuery,
  ForwardMetricsSummary,
  ForwardRequestMetrics,
  MetricsGranularity,
  MetricsSummary,
  ModelMetrics,
  SessionDetail,
  SessionMetrics,
  UnifiedSummary,
  UnifiedTimelinePoint,
} from "../../../../../services/metrics";

export interface UnifiedMetricsFilters {
  startDate?: string;
  endDate?: string;
  model?: string;
  days?: number;
  granularity?: MetricsGranularity;
  sessionLimit?: number;
}

interface UseUnifiedMetricsOptions {
  filters?: UnifiedMetricsFilters;
  autoRefreshMs?: number;
}

const DEFAULT_AUTO_REFRESH_MS = 15_000;

const toErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
};

export const useUnifiedMetrics = (options: UseUnifiedMetricsOptions = {}) => {
  const { filters, autoRefreshMs = DEFAULT_AUTO_REFRESH_MS } = options;

  const normalizedFilters = useMemo(
    () => ({
      startDate: filters?.startDate,
      endDate: filters?.endDate,
      model: filters?.model,
      days: filters?.days ?? 30,
      granularity: filters?.granularity ?? "daily",
      sessionLimit: filters?.sessionLimit ?? 200,
    }),
    [
      filters?.startDate,
      filters?.endDate,
      filters?.model,
      filters?.days,
      filters?.granularity,
      filters?.sessionLimit,
    ],
  );

  // Chat metrics state
  const [chatSummary, setChatSummary] = useState<MetricsSummary | null>(null);
  const [modelMetrics, setModelMetrics] = useState<ModelMetrics[]>([]);
  const [sessions, setSessions] = useState<SessionMetrics[]>([]);
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(null);
  const [isSessionDetailLoading, setIsSessionDetailLoading] = useState(false);

  // Forward metrics state
  const [forwardSummary, setForwardSummary] =
    useState<ForwardMetricsSummary | null>(null);
  const [endpointMetrics, setEndpointMetrics] = useState<
    ForwardEndpointMetrics[]
  >([]);
  const [forwardRequests, setForwardRequests] = useState<ForwardRequestMetrics[]>(
    [],
  );

  // Unified metrics state
  const [combinedSummary, setCombinedSummary] =
    useState<CombinedSummary | null>(null);
  const [timeline, setTimeline] = useState<UnifiedTimelinePoint[]>([]);

  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAllMetrics = useCallback(
    async (showLoading: boolean) => {
      if (showLoading) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }

      try {
        // Load unified summary and timeline
        const [unifiedSummary, timelineResponse] = await Promise.all([
          metricsService.getUnifiedSummary({
            startDate: normalizedFilters.startDate,
            endDate: normalizedFilters.endDate,
          }),
          metricsService.getUnifiedTimeline({
            days: normalizedFilters.days,
            endDate: normalizedFilters.endDate,
            granularity: normalizedFilters.granularity,
          }),
        ]);

        setChatSummary(unifiedSummary.chat);
        setForwardSummary(unifiedSummary.forward);
        setCombinedSummary(unifiedSummary.combined);
        setTimeline(timelineResponse);

        // Load detailed metrics in parallel
        const forwardQuery: ForwardMetricsQuery = {
          startDate: normalizedFilters.startDate,
          endDate: normalizedFilters.endDate,
          model: normalizedFilters.model,
          limit: normalizedFilters.sessionLimit,
        };

        const [modelResponse, sessionsResponse, endpointResponse, requestsResponse] =
          await Promise.all([
            metricsService.getByModel({
              startDate: normalizedFilters.startDate,
              endDate: normalizedFilters.endDate,
            }),
            metricsService.getSessions({
              startDate: normalizedFilters.startDate,
              endDate: normalizedFilters.endDate,
              model: normalizedFilters.model,
              limit: normalizedFilters.sessionLimit,
            }),
            metricsService.getForwardByEndpoint(forwardQuery),
            metricsService.getForwardRequests(forwardQuery),
          ]);

        setModelMetrics(modelResponse);
        setSessions(sessionsResponse);
        setEndpointMetrics(endpointResponse);
        setForwardRequests(requestsResponse);
        setError(null);
      } catch (loadError) {
        setError(toErrorMessage(loadError, "Failed to load metrics"));
      } finally {
        if (showLoading) {
          setIsLoading(false);
        } else {
          setIsRefreshing(false);
        }
      }
    },
    [
      normalizedFilters.days,
      normalizedFilters.endDate,
      normalizedFilters.granularity,
      normalizedFilters.model,
      normalizedFilters.sessionLimit,
      normalizedFilters.startDate,
    ],
  );

  const refresh = useCallback(async () => {
    await loadAllMetrics(false);
  }, [loadAllMetrics]);

  const loadSessionDetail = useCallback(async (sessionId: string) => {
    setIsSessionDetailLoading(true);
    try {
      const detail = await metricsService.getSessionDetail(sessionId);
      setSessionDetail(detail);
    } catch (detailError) {
      setError(toErrorMessage(detailError, "Failed to load session detail"));
    } finally {
      setIsSessionDetailLoading(false);
    }
  }, []);

  const clearSessionDetail = useCallback(() => {
    setSessionDetail(null);
  }, []);

  useEffect(() => {
    void loadAllMetrics(true);
  }, [loadAllMetrics]);

  useEffect(() => {
    if (autoRefreshMs <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadAllMetrics(false);
    }, autoRefreshMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [autoRefreshMs, loadAllMetrics]);

  // Derived combined metrics for convenience
  const totalTokens = useMemo(() => {
    const chatTokens = chatSummary?.total_tokens.total_tokens ?? 0;
    const forwardTokens = forwardSummary?.total_tokens.total_tokens ?? 0;
    return chatTokens + forwardTokens;
  }, [chatSummary, forwardSummary]);

  const totalRequests = useMemo(() => {
    const chatSessions = chatSummary?.total_sessions ?? 0;
    const forwardRequests = forwardSummary?.total_requests ?? 0;
    return chatSessions + forwardRequests;
  }, [chatSummary, forwardSummary]);

  return {
    // Chat metrics
    chatSummary,
    modelMetrics,
    sessions,
    sessionDetail,
    isSessionDetailLoading,
    loadSessionDetail,
    clearSessionDetail,

    // Forward metrics
    forwardSummary,
    endpointMetrics,
    forwardRequests,

    // Unified metrics
    combinedSummary,
    timeline,
    totalTokens,
    totalRequests,

    // Loading states
    isLoading,
    isRefreshing,
    error,
    refresh,
  };
};

export type UnifiedMetricsReturn = ReturnType<typeof useUnifiedMetrics>;
