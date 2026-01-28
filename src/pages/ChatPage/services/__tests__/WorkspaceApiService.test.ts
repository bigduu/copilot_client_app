import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  workspaceApiService,
  useWorkspaceApiService,
} from "../WorkspaceApiService";

// Mock fetch globally
global.fetch = vi.fn();

// Mock AbortSignal.timeout for older environments
if (!global.AbortSignal.timeout) {
  global.AbortSignal.timeout = vi.fn(() => {
    const controller = new AbortController();
    // Don't actually timeout for tests
    return controller.signal;
  });
}

// Mock console methods
global.console = {
  ...console,
  warn: vi.fn(),
  error: vi.fn(),
};

describe("WorkspaceApiService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe("validateWorkspacePath", () => {
    it("should validate workspace path", async () => {
      const mockResult = {
        path: "/valid/workspace",
        is_valid: true,
        file_count: 10,
        workspace_name: "workspace",
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
        headers: new Headers({ "content-type": "application/json" }),
      });

      const result =
        await workspaceApiService.validateWorkspacePath("/valid/workspace");

      expect(fetch).toHaveBeenCalledWith(
        "http://127.0.0.1:8080/v1/workspace/validate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ path: "/valid/workspace" }),
          signal: expect.any(AbortSignal),
        },
      );

      expect(result).toEqual(mockResult);
    });

    it("should handle validation errors", async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => "Invalid path",
      });

      await expect(
        workspaceApiService.validateWorkspacePath("/invalid/path"),
      ).rejects.toThrow("HTTP 400: Invalid path");
    });
  });

  describe("getRecentWorkspaces", () => {
    it("should get recent workspaces", async () => {
      const mockWorkspaces = [
        { path: "/workspace1", is_valid: true },
        { path: "/workspace2", is_valid: true },
      ];

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockWorkspaces,
        headers: new Headers({ "content-type": "application/json" }),
      });

      const result = await workspaceApiService.getRecentWorkspaces();

      expect(fetch).toHaveBeenCalledWith(
        "http://127.0.0.1:8080/v1/workspace/recent",
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          signal: expect.any(AbortSignal),
        },
      );

      expect(result).toEqual(mockWorkspaces);
    });
  });

  describe("addRecentWorkspace", () => {
    it("should add recent workspace", async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
        headers: new Headers({ "content-type": "application/json" }),
      });

      await workspaceApiService.addRecentWorkspace("/new/workspace", {
        workspace_name: "new-workspace",
      });

      expect(fetch).toHaveBeenCalledWith(
        "http://127.0.0.1:8080/v1/workspace/recent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            path: "/new/workspace",
            metadata: { workspace_name: "new-workspace" },
          }),
          signal: expect.any(AbortSignal),
        },
      );
    });
  });

  describe("getPathSuggestions", () => {
    it("should get path suggestions", async () => {
      const mockSuggestions = {
        suggestions: [
          { path: "/home", name: "Home", suggestion_type: "home" },
          {
            path: "/documents",
            name: "Documents",
            suggestion_type: "documents",
          },
        ],
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuggestions,
        headers: new Headers({ "content-type": "application/json" }),
      });

      const result = await workspaceApiService.getPathSuggestions();

      expect(fetch).toHaveBeenCalledWith(
        "http://127.0.0.1:8080/v1/workspace/suggestions",
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          signal: expect.any(AbortSignal),
        },
      );

      expect(result).toEqual(mockSuggestions);
    });
  });

  describe("getHealthStatus", () => {
    it("should return available status when API is working", async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
        headers: new Headers({ "content-type": "application/json" }),
      });

      const status = await workspaceApiService.getHealthStatus();

      expect(status.available).toBe(true);
      expect(typeof status.latency).toBe("number");
      expect(status.error).toBeUndefined();
    });

    it("should return unavailable status when API fails", async () => {
      (fetch as any).mockRejectedValueOnce(new Error("API unavailable"));

      const status = await workspaceApiService.getHealthStatus();

      expect(status.available).toBe(false);
      expect(status.latency).toBeUndefined();
      expect(status.error).toBe("API unavailable");
    });
  });

  describe("custom configuration", () => {
    it("should use custom base URL", async () => {
      const service = useWorkspaceApiService({
        baseUrl: "http://localhost:8080/custom/api/workspace",
      });

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
        headers: new Headers({ "content-type": "application/json" }),
      });

      await service.getRecentWorkspaces();

      expect(fetch).toHaveBeenCalledWith(
        "http://localhost:8080/custom/api/workspace/recent",
        expect.any(Object),
      );
    });

    it("should use custom headers", async () => {
      const service = useWorkspaceApiService({
        headers: {
          Authorization: "Bearer token",
          "X-Custom-Header": "custom-value",
        },
      });

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
        headers: new Headers({ "content-type": "application/json" }),
      });

      await service.getRecentWorkspaces();

      expect(fetch).toHaveBeenCalledWith(
        "http://127.0.0.1:8080/v1/workspace/recent",
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer token",
            "X-Custom-Header": "custom-value",
          },
          signal: expect.any(AbortSignal),
        },
      );
    });
  });
});

describe("useWorkspaceApiService", () => {
  it("should return a new WorkspaceApiService instance", () => {
    const service = useWorkspaceApiService();

    expect(service).toHaveProperty("validateWorkspacePath");
    expect(service).toHaveProperty("getRecentWorkspaces");
    expect(service).toHaveProperty("addRecentWorkspace");
    expect(service).toHaveProperty("getPathSuggestions");
  });

  it("should accept custom options", () => {
    const customOptions = {
      baseUrl: "/custom/api",
      timeoutMs: 5000,
      retries: 1,
    };

    const service = useWorkspaceApiService(customOptions);

    expect(service).toHaveProperty("validateWorkspacePath");
  });
});
