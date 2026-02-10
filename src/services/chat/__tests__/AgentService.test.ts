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

    const client = AgentClient.getInstance();

    await client.deleteSession("session-1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/sessions/session-1"),
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("throws when backend session deletion fails", async () => {
    fetchMock.mockResolvedValue(mockFetchError("Server Error", 500));

    const client = AgentClient.getInstance();

    await expect(client.deleteSession("session-1")).rejects.toThrow();
  });
});
