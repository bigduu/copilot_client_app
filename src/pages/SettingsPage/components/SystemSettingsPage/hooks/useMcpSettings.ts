import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  mcpService,
  type McpServer,
  type McpServerConfig,
  type McpToolInfo,
} from "../../../../../services/mcp";

export type McpServerAction = "connect" | "disconnect" | "refresh" | "delete";

interface McpSettingsService {
  getServers: () => Promise<McpServer[]>;
  addServer: (config: McpServerConfig) => Promise<unknown>;
  updateServer: (serverId: string, config: McpServerConfig) => Promise<unknown>;
  deleteServer: (serverId: string) => Promise<unknown>;
  connectServer: (serverId: string) => Promise<unknown>;
  disconnectServer: (serverId: string) => Promise<unknown>;
  refreshTools: (serverId: string) => Promise<unknown>;
  getTools: (serverId?: string) => Promise<McpToolInfo[]>;
}

interface UseMcpSettingsOptions {
  service?: McpSettingsService;
  autoRefreshMs?: number;
  autoRefreshEnabled?: boolean;
}

interface UseMcpSettingsResult {
  servers: McpServer[];
  selectedServerId: string | null;
  selectedServerTools: McpToolInfo[];
  isLoadingServers: boolean;
  isMutatingConfig: boolean;
  isRefreshingAll: boolean;
  isSelectedServerToolsLoading: boolean;
  error: string | null;
  setSelectedServerId: (serverId: string | null) => void;
  refreshServers: (options?: { silent?: boolean }) => Promise<void>;
  addServer: (config: McpServerConfig) => Promise<void>;
  updateServer: (serverId: string, config: McpServerConfig) => Promise<void>;
  deleteServer: (serverId: string) => Promise<void>;
  connectServer: (serverId: string) => Promise<void>;
  disconnectServer: (serverId: string) => Promise<void>;
  refreshServerTools: (serverId: string) => Promise<void>;
  refreshAll: () => Promise<void>;
  isServerActionLoading: (serverId: string, action: McpServerAction) => boolean;
}

const DEFAULT_AUTO_REFRESH_MS = 5_000;

const toErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
};

const getActionKey = (serverId: string, action: McpServerAction): string =>
  `${serverId}:${action}`;

export const useMcpSettings = (
  options: UseMcpSettingsOptions = {},
): UseMcpSettingsResult => {
  const {
    service = mcpService,
    autoRefreshMs = DEFAULT_AUTO_REFRESH_MS,
    autoRefreshEnabled = true,
  } = options;

  const [servers, setServers] = useState<McpServer[]>([]);
  const [selectedServerId, setSelectedServerIdState] = useState<string | null>(
    null,
  );
  const [toolsByServer, setToolsByServer] = useState<Record<string, McpToolInfo[]>>(
    {},
  );
  const [toolLoadingByServer, setToolLoadingByServer] = useState<
    Record<string, boolean>
  >({});
  const [actionLoadingMap, setActionLoadingMap] = useState<Record<string, boolean>>(
    {},
  );
  const [isLoadingServers, setIsLoadingServers] = useState(false);
  const [isMutatingConfig, setIsMutatingConfig] = useState(false);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configCacheRef = useRef<Record<string, McpServerConfig>>({});

  const mergeServers = useCallback((incoming: McpServer[]): McpServer[] => {
    const incomingIds = new Set(incoming.map((server) => server.id));
    const merged = incoming.map((server) => {
      const cachedConfig = configCacheRef.current[server.id];
      const config = cachedConfig ?? server.config;
      const normalizedConfig: McpServerConfig = {
        ...config,
        id: server.id,
        name: config.name ?? server.name,
      };
      configCacheRef.current[server.id] = normalizedConfig;
      return {
        ...server,
        name: server.name || normalizedConfig.name || server.id,
        enabled: server.enabled ?? normalizedConfig.enabled,
        config: normalizedConfig,
      };
    });

    Object.keys(configCacheRef.current).forEach((serverId) => {
      if (!incomingIds.has(serverId)) {
        delete configCacheRef.current[serverId];
      }
    });

    return merged;
  }, []);

  const refreshServers = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) {
        setIsLoadingServers(true);
      }

      try {
        const incoming = await service.getServers();
        const merged = mergeServers(incoming);
        setServers(merged);
        setSelectedServerIdState((current) => {
          if (current && merged.some((server) => server.id === current)) {
            return current;
          }
          return merged[0]?.id ?? null;
        });
        setError(null);
      } catch (loadError) {
        setError(toErrorMessage(loadError, "Failed to load MCP servers"));
        throw loadError;
      } finally {
        if (!silent) {
          setIsLoadingServers(false);
        }
      }
    },
    [mergeServers, service],
  );

  const loadServerTools = useCallback(
    async (serverId: string, force = false) => {
      if (!serverId) {
        return [] as McpToolInfo[];
      }

      if (!force && toolsByServer[serverId]) {
        return toolsByServer[serverId];
      }

      setToolLoadingByServer((prev) => ({
        ...prev,
        [serverId]: true,
      }));

      try {
        const tools = await service.getTools(serverId);
        setToolsByServer((prev) => ({
          ...prev,
          [serverId]: tools,
        }));
        setError(null);
        return tools;
      } catch (toolsError) {
        setError(toErrorMessage(toolsError, "Failed to load MCP tools"));
        throw toolsError;
      } finally {
        setToolLoadingByServer((prev) => ({
          ...prev,
          [serverId]: false,
        }));
      }
    },
    [service, toolsByServer],
  );

  const setServerActionLoading = useCallback(
    (serverId: string, action: McpServerAction, loading: boolean) => {
      const key = getActionKey(serverId, action);
      setActionLoadingMap((prev) => ({
        ...prev,
        [key]: loading,
      }));
    },
    [],
  );

  const addServer = useCallback(
    async (config: McpServerConfig) => {
      setIsMutatingConfig(true);
      try {
        await service.addServer(config);
        configCacheRef.current[config.id] = config;
        await refreshServers();
      } catch (saveError) {
        setError(toErrorMessage(saveError, "Failed to add MCP server"));
        throw saveError;
      } finally {
        setIsMutatingConfig(false);
      }
    },
    [refreshServers, service],
  );

  const updateServer = useCallback(
    async (serverId: string, config: McpServerConfig) => {
      setIsMutatingConfig(true);
      try {
        const normalizedConfig = {
          ...config,
          id: serverId,
        };
        await service.updateServer(serverId, normalizedConfig);
        configCacheRef.current[serverId] = normalizedConfig;
        await refreshServers();
      } catch (updateError) {
        setError(toErrorMessage(updateError, "Failed to update MCP server"));
        throw updateError;
      } finally {
        setIsMutatingConfig(false);
      }
    },
    [refreshServers, service],
  );

  const deleteServer = useCallback(
    async (serverId: string) => {
      setServerActionLoading(serverId, "delete", true);
      try {
        await service.deleteServer(serverId);
        setToolsByServer((prev) => {
          const next = { ...prev };
          delete next[serverId];
          return next;
        });
        delete configCacheRef.current[serverId];
        await refreshServers();
      } catch (deleteError) {
        setError(toErrorMessage(deleteError, "Failed to delete MCP server"));
        throw deleteError;
      } finally {
        setServerActionLoading(serverId, "delete", false);
      }
    },
    [refreshServers, service, setServerActionLoading],
  );

  const connectServer = useCallback(
    async (serverId: string) => {
      setServerActionLoading(serverId, "connect", true);
      try {
        await service.connectServer(serverId);
        await refreshServers({ silent: true });
      } catch (connectError) {
        setError(toErrorMessage(connectError, "Failed to connect MCP server"));
        throw connectError;
      } finally {
        setServerActionLoading(serverId, "connect", false);
      }
    },
    [refreshServers, service, setServerActionLoading],
  );

  const disconnectServer = useCallback(
    async (serverId: string) => {
      setServerActionLoading(serverId, "disconnect", true);
      try {
        await service.disconnectServer(serverId);
        await refreshServers({ silent: true });
      } catch (disconnectError) {
        setError(
          toErrorMessage(disconnectError, "Failed to disconnect MCP server"),
        );
        throw disconnectError;
      } finally {
        setServerActionLoading(serverId, "disconnect", false);
      }
    },
    [refreshServers, service, setServerActionLoading],
  );

  const refreshServerTools = useCallback(
    async (serverId: string) => {
      setServerActionLoading(serverId, "refresh", true);
      try {
        await service.refreshTools(serverId);
        await loadServerTools(serverId, true);
        await refreshServers({ silent: true });
      } catch (refreshError) {
        setError(toErrorMessage(refreshError, "Failed to refresh MCP tools"));
        throw refreshError;
      } finally {
        setServerActionLoading(serverId, "refresh", false);
      }
    },
    [loadServerTools, refreshServers, service, setServerActionLoading],
  );

  const refreshAll = useCallback(async () => {
    setIsRefreshingAll(true);
    try {
      const serverIds = servers.map((server) => server.id);
      await Promise.all(
        serverIds.map(async (serverId) => {
          try {
            await service.refreshTools(serverId);
          } catch {
            // Continue with remaining servers; errors surface in next status refresh.
          }
        }),
      );

      await refreshServers();

      if (selectedServerId) {
        await loadServerTools(selectedServerId, true);
      }
    } catch (refreshError) {
      setError(toErrorMessage(refreshError, "Failed to refresh MCP status"));
      throw refreshError;
    } finally {
      setIsRefreshingAll(false);
    }
  }, [loadServerTools, refreshServers, selectedServerId, servers, service]);

  const setSelectedServerId = useCallback((serverId: string | null) => {
    setSelectedServerIdState(serverId);
  }, []);

  const isServerActionLoading = useCallback(
    (serverId: string, action: McpServerAction): boolean => {
      return Boolean(actionLoadingMap[getActionKey(serverId, action)]);
    },
    [actionLoadingMap],
  );

  const selectedServerTools = useMemo(() => {
    if (!selectedServerId) {
      return [];
    }
    return toolsByServer[selectedServerId] ?? [];
  }, [selectedServerId, toolsByServer]);

  const isSelectedServerToolsLoading = useMemo(() => {
    if (!selectedServerId) {
      return false;
    }
    return Boolean(toolLoadingByServer[selectedServerId]);
  }, [selectedServerId, toolLoadingByServer]);

  useEffect(() => {
    void refreshServers().catch(() => undefined);
  }, [refreshServers]);

  useEffect(() => {
    if (!autoRefreshEnabled || autoRefreshMs <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshServers({ silent: true }).catch(() => undefined);
    }, autoRefreshMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [autoRefreshEnabled, autoRefreshMs, refreshServers]);

  useEffect(() => {
    if (!selectedServerId) {
      return;
    }
    void loadServerTools(selectedServerId).catch(() => undefined);
  }, [loadServerTools, selectedServerId]);

  return {
    servers,
    selectedServerId,
    selectedServerTools,
    isLoadingServers,
    isMutatingConfig,
    isRefreshingAll,
    isSelectedServerToolsLoading,
    error,
    setSelectedServerId,
    refreshServers,
    addServer,
    updateServer,
    deleteServer,
    connectServer,
    disconnectServer,
    refreshServerTools,
    refreshAll,
    isServerActionLoading,
  };
};
