import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpUtilityService } from "../HttpServices";
import { serviceFactory } from "../ServiceFactory";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("MCP services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("HttpUtilityService.reloadMcpServers posts to /mcp/reload", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ mcpServers: {} }),
    });

    const service = new HttpUtilityService();
    const result = await service.reloadMcpServers();

    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8080/v1/mcp/reload",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(result).toEqual({ mcpServers: {} });
  });

  it("ServiceFactory.reloadMcpServers delegates to HttpUtilityService", async () => {
    const spy = vi.spyOn(HttpUtilityService.prototype, "reloadMcpServers");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ mcpServers: {} }),
    });

    await serviceFactory.reloadMcpServers();

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
