import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useMetrics } from "../useMetrics";

describe("useMetrics", () => {
  it("loads metrics datasets on mount and exposes refresh", async () => {
    const service = {
      getSummary: vi.fn().mockResolvedValue({
        total_sessions: 2,
        total_tokens: {
          prompt_tokens: 5,
          completion_tokens: 7,
          total_tokens: 12,
        },
        total_tool_calls: 3,
        active_sessions: 1,
      }),
      getByModel: vi.fn().mockResolvedValue([]),
      getSessions: vi.fn().mockResolvedValue([]),
      getDaily: vi.fn().mockResolvedValue([]),
      getSessionDetail: vi.fn().mockResolvedValue(null),
    };

    const { result } = renderHook(() =>
      useMetrics({
        service,
        autoRefreshMs: 0,
        filters: {
          days: 30,
          granularity: "daily",
        },
      }),
    );

    await waitFor(() => {
      expect(result.current.summary?.total_sessions).toBe(2);
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(service.getSummary).toHaveBeenCalledTimes(2);
  });

  it("loads session detail on demand", async () => {
    const service = {
      getSummary: vi.fn().mockResolvedValue({
        total_sessions: 1,
        total_tokens: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
        total_tool_calls: 0,
        active_sessions: 0,
      }),
      getByModel: vi.fn().mockResolvedValue([]),
      getSessions: vi.fn().mockResolvedValue([]),
      getDaily: vi.fn().mockResolvedValue([]),
      getSessionDetail: vi.fn().mockResolvedValue({
        session: {
          session_id: "session-1",
          model: "gpt-4",
          started_at: "2026-02-10T10:00:00Z",
          completed_at: "2026-02-10T10:05:00Z",
          total_rounds: 1,
          total_token_usage: {
            prompt_tokens: 1,
            completion_tokens: 2,
            total_tokens: 3,
          },
          tool_call_count: 0,
          tool_breakdown: {},
          status: "completed",
          message_count: 2,
          duration_ms: 300000,
        },
        rounds: [],
      }),
    };

    const { result } = renderHook(() =>
      useMetrics({
        service,
        autoRefreshMs: 0,
        filters: {
          days: 30,
          granularity: "daily",
        },
      }),
    );

    await waitFor(() => {
      expect(result.current.summary?.total_sessions).toBe(1);
    });

    await act(async () => {
      await result.current.loadSessionDetail("session-1");
    });

    expect(service.getSessionDetail).toHaveBeenCalledWith("session-1");
    expect(result.current.sessionDetail?.session.session_id).toBe("session-1");
  });
});
