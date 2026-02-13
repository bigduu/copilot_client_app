import { useCallback, useEffect, useMemo, useState } from "react";

import { metricsService } from "../../../../../services/metrics";
import type {
  ForwardEndpointMetrics,
  ForwardMetricsQuery,
  ForwardMetricsSummary,
  ForwardRequestMetrics,
} from "../../../../../services/metrics";

export interface ForwardMetricsFilters {
  startDate?: string;
  endDate?: string;
  endpoint?: string;
  model?: string;
  limit?: number;
}

interface UseForwardMetricsOptions {
  filters?: ForwardMetricsFilters;
  autoRefreshMs?: number;
}

const DEFAULT_AUTO_REFRESH_MS = 15_000;

const toErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
};

export const useForwardMetrics = (options: UseForwardMetricsOptions = {}) => {
  const { filters, autoRefreshMs = DEFAULT_AUTO_REFRESH_MS } = options;

  const normalizedFilters = useMemo(
    () => ({
      startDate: filters?.startDate,
      endDate: filters?.endDate,
      endpoint: filters?.endpoint,
      model: filters?.model,
      limit: filters?.limit ?? 100,
    }),
    [
      filters?.startDate,
      filters?.endDate,
      filters?.endpoint,
      filters?.model,
      filters?.limit,
    ],
  );

  const [summary, setSummary] = useState<ForwardMetricsSummary | null>(null);
  const [endpointMetrics, setEndpointMetrics] = useState<
    ForwardEndpointMetrics[]
  >([]);
  const [requests, setRequests] = useState<ForwardRequestMetrics[]>([]);
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
        const query: ForwardMetricsQuery = {
          startDate: normalizedFilters.startDate,
          endDate: normalizedFilters.endDate,
          endpoint: normalizedFilters.endpoint,
          model: normalizedFilters.model,
          limit: normalizedFilters.limit,
        };

        const [summaryResponse, endpointResponse, requestsResponse] =
          await Promise.all([
            metricsService.getForwardSummary(query),
            metricsService.getForwardByEndpoint(query),
            metricsService.getForwardRequests(query),
          ]);

        setSummary(summaryResponse);
        setEndpointMetrics(endpointResponse);
        setRequests(requestsResponse);
        setError(null);
      } catch (loadError) {
        setError(toErrorMessage(loadError, "Failed to load forward metrics"));
      } finally {
        if (showLoading) {
          setIsLoading(false);
        } else {
          setIsRefreshing(false);
        }
      }
    },
    [
      normalizedFilters.startDate,
      normalizedFilters.endDate,
      normalizedFilters.endpoint,
      normalizedFilters.model,
      normalizedFilters.limit,
    ],
  );

  const refresh = useCallback(async () => {
    await loadAllMetrics(false);
  }, [loadAllMetrics]);

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

  return {
    summary,
    endpointMetrics,
    requests,
    isLoading,
    isRefreshing,
    error,
    refresh,
  };
};
