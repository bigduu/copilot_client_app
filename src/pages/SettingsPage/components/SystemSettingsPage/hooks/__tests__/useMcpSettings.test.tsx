import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  ServerStatus,
  type McpServer,
  type McpServerConfig,
  type McpToolInfo,
} from "../../../../../../services/mcp/types";
import { useMcpSettings } from "../useMcpSettings";

const makeServer = (id: string): McpServer => ({
  id,
  name: id,
  enabled: true,
  config: {
    id,
    enabled: true,
    transport: {
      type: "stdio",
      command: "npx",
      args: ["server"],
      env: {},
    },
    request_timeout_ms: 60000,
    healthcheck_interval_ms: 30000,
    allowed_tools: [],
    denied_tools: [],
  },
  runtime: {
    status: ServerStatus.Ready,
    tool_count: 0,
    restart_count: 0,
  },
});

const makeConfig = (id: string): McpServerConfig => ({
  id,
  enabled: true,
  transport: {
    type: "stdio",
    command: "npx",
    args: ["server"],
    env: {},
  },
  request_timeout_ms: 60000,
  healthcheck_interval_ms: 30000,
  allowed_tools: [],
  denied_tools: [],
});

describe("useMcpSettings", () => {
  it("loads servers immediately and auto-refreshes status", async () => {
    const service = {
      getServers: vi.fn().mockResolvedValue([makeServer("filesystem")]),
      addServer: vi.fn(),
      updateServer: vi.fn(),
      deleteServer: vi.fn(),
      connectServer: vi.fn(),
      disconnectServer: vi.fn(),
      refreshTools: vi.fn(),
      getTools: vi.fn().mockResolvedValue([]),
    };

    const { result } = renderHook(() =>
      useMcpSettings({
        service,
        autoRefreshMs: 20,
      }),
    );

    await waitFor(() => {
      expect(result.current.servers).toHaveLength(1);
    });

    await waitFor(() => {
      expect(service.getServers.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("adds servers then refreshes list", async () => {
    const service = {
      getServers: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([makeServer("filesystem")]),
      addServer: vi.fn().mockResolvedValue(undefined),
      updateServer: vi.fn(),
      deleteServer: vi.fn(),
      connectServer: vi.fn(),
      disconnectServer: vi.fn(),
      refreshTools: vi.fn(),
      getTools: vi.fn().mockResolvedValue([]),
    };

    const { result } = renderHook(() => useMcpSettings({ service }));

    await waitFor(() => {
      expect(result.current.servers).toEqual([]);
    });

    await act(async () => {
      await result.current.addServer(makeConfig("filesystem"));
    });

    await waitFor(() => {
      expect(service.addServer).toHaveBeenCalledWith(makeConfig("filesystem"));
      expect(result.current.servers).toHaveLength(1);
    });
  });

  it("loads tools for the selected server", async () => {
    const tools: McpToolInfo[] = [
      {
        alias: "mcp__filesystem__read_file",
        server_id: "filesystem",
        original_name: "read_file",
        description: "Read file contents",
      },
    ];

    const service = {
      getServers: vi.fn().mockResolvedValue([makeServer("filesystem")]),
      addServer: vi.fn(),
      updateServer: vi.fn(),
      deleteServer: vi.fn(),
      connectServer: vi.fn(),
      disconnectServer: vi.fn(),
      refreshTools: vi.fn(),
      getTools: vi.fn().mockResolvedValue(tools),
    };

    const { result } = renderHook(() => useMcpSettings({ service }));

    await waitFor(() => {
      expect(result.current.servers).toHaveLength(1);
    });

    await act(async () => {
      result.current.setSelectedServerId("filesystem");
    });

    await waitFor(() => {
      expect(service.getTools).toHaveBeenCalledWith("filesystem");
      expect(result.current.selectedServerTools).toEqual(tools);
    });
  });
});
