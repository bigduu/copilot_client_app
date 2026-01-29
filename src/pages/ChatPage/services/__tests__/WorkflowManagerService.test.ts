import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { WorkflowManagerService } from "../WorkflowManagerService";
import { mockFetchError, mockFetchResponse } from "../../../../test/helpers";

describe("WorkflowManagerService", () => {
  let service: WorkflowManagerService;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    service = WorkflowManagerService.getInstance();
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists workflows from bodhi config endpoint", async () => {
    const workflows = [
      {
        name: "review",
        filename: "review.md",
        size: 120,
        modified_at: "2025-01-01T00:00:00Z",
      },
    ];
    mockFetch.mockResolvedValue(mockFetchResponse(workflows));

    const result = await service.listWorkflows();

    expect(result).toEqual([
      {
        name: "review",
        filename: "review.md",
        size: 120,
        modified_at: "2025-01-01T00:00:00Z",
        source: "global",
      },
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8080/v1/bodhi/workflows",
    );
  });

  it("gets workflow content from bodhi config endpoint", async () => {
    const workflow = {
      name: "review",
      content: "# Review\n\n1. Check logs.",
      filename: "review.md",
      size: 64,
      modified_at: "2025-01-02T00:00:00Z",
    };
    mockFetch.mockResolvedValue(mockFetchResponse(workflow));

    const result = await service.getWorkflow("review");

    expect(result).toEqual({
      name: "review",
      content: "# Review\n\n1. Check logs.",
      metadata: {
        name: "review",
        filename: "review.md",
        size: 64,
        modified_at: "2025-01-02T00:00:00Z",
        source: "global",
      },
    });
  });

  it("throws when workflow is missing", async () => {
    mockFetch.mockResolvedValue(mockFetchError("Not found", 404));

    await expect(service.getWorkflow("missing")).rejects.toThrow(
      "Workflow 'missing' not found",
    );
  });
});
