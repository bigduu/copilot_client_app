import { agentApiClient } from "../api";
import type {
  DailyMetrics,
  MetricsDailyQuery,
  MetricsDateRange,
  MetricsSummary,
  ModelMetrics,
  PeriodMetrics,
  SessionDetail,
  SessionMetrics,
  MetricsSessionQuery,
} from "./types";

type DailyOrPeriodMetrics = DailyMetrics[] | PeriodMetrics[];

const buildQueryString = (
  query: Record<string, string | number | undefined>,
): string => {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === "") {
      return;
    }
    params.set(key, String(value));
  });

  const output = params.toString();
  return output ? `?${output}` : "";
};

export class MetricsService {
  async getSummary(range: MetricsDateRange = {}): Promise<MetricsSummary> {
    const query = buildQueryString({
      start_date: range.startDate,
      end_date: range.endDate,
    });
    return agentApiClient.get<MetricsSummary>(`metrics/summary${query}`);
  }

  async getByModel(range: MetricsDateRange = {}): Promise<ModelMetrics[]> {
    const query = buildQueryString({
      start_date: range.startDate,
      end_date: range.endDate,
    });
    return agentApiClient.get<ModelMetrics[]>(`metrics/by-model${query}`);
  }

  async getSessions(query: MetricsSessionQuery = {}): Promise<SessionMetrics[]> {
    const queryString = buildQueryString({
      start_date: query.startDate,
      end_date: query.endDate,
      model: query.model,
      limit: query.limit,
    });
    return agentApiClient.get<SessionMetrics[]>(`metrics/sessions${queryString}`);
  }

  async getSessionDetail(sessionId: string): Promise<SessionDetail | null> {
    try {
      return await agentApiClient.get<SessionDetail>(
        `metrics/sessions/${encodeURIComponent(sessionId)}`,
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        return null;
      }
      throw error;
    }
  }

  async getDaily(query: MetricsDailyQuery = {}): Promise<DailyOrPeriodMetrics> {
    const queryString = buildQueryString({
      days: query.days,
      end_date: query.endDate,
      granularity: query.granularity,
    });
    return agentApiClient.get<DailyOrPeriodMetrics>(`metrics/daily${queryString}`);
  }
}

export const metricsService = new MetricsService();
