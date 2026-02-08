import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AgentClient } from "../AgentService";
import { mockFetchError, mockFetchResponse } from "../../../test/helpers";

describe("AgentClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deletes a backend session by ID", async () => {
    fetchMock.mockResolvedValue(mockFetchResponse({}));

    const client = new AgentClient("http://localhost:8080");

    await client.deleteSession("session-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/api/v1/sessions/session-1",
      { method: "DELETE" },
    );
  });

  it("throws when backend session deletion fails", async () => {
    fetchMock.mockResolvedValue(mockFetchError("Server Error", 500));

    const client = new AgentClient("http://localhost:8080");

    await expect(client.deleteSession("session-1")).rejects.toThrow(
      "Failed to delete session: Server Error",
    );
  });
});
