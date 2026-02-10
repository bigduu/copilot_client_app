import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockFetchResponse } from "../../../test/helpers";
import { MetricsService } from "../MetricsService";

describe("MetricsService", () => {
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch;
  });

  it("calls summary endpoint with date range query params", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse({
        total_sessions: 4,
        total_tokens: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
        total_tool_calls: 6,
        active_sessions: 1,
      }),
    );

    const service = new MetricsService();
    const summary = await service.getSummary({
      startDate: "2026-02-01",
      endDate: "2026-02-10",
    });

    expect(summary.total_sessions).toBe(4);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8080/api/v1/metrics/summary?start_date=2026-02-01&end_date=2026-02-10",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("calls daily endpoint with granularity option", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse([
        {
          label: "2026-02-03..2026-02-09",
          period_start: "2026-02-03",
          period_end: "2026-02-09",
          total_sessions: 4,
          total_rounds: 5,
          total_token_usage: {
            prompt_tokens: 12,
            completion_tokens: 13,
            total_tokens: 25,
          },
          total_tool_calls: 6,
          model_breakdown: {},
          tool_breakdown: {},
        },
      ]),
    );

    const service = new MetricsService();
    const daily = await service.getDaily({
      days: 14,
      granularity: "weekly",
    });

    expect(daily).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8080/api/v1/metrics/daily?days=14&granularity=weekly",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
