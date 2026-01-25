import { useEffect, useRef, useState } from "react";
import { serviceFactory } from "../../services/ServiceFactory";

const SECRET_MASK = "***";

const cloneJson = (value: any) => {
  try {
    return JSON.parse(JSON.stringify(value ?? {}));
  } catch {
    return {};
  }
};

const maskProxyAuth = (auth: any) => {
  if (!auth || typeof auth !== "object") {
    return auth;
  }
  const next = { ...auth };
  if (typeof next.password === "string" && next.password.length > 0) {
    next.password = SECRET_MASK;
  }
  return next;
};

const maskBodhiConfig = (config: any) => {
  const next = cloneJson(config);
  if (next.http_proxy_auth) {
    next.http_proxy_auth = maskProxyAuth(next.http_proxy_auth);
  }
  if (next.https_proxy_auth) {
    next.https_proxy_auth = maskProxyAuth(next.https_proxy_auth);
  }
  return next;
};

const resolveMaskedProxyAuth = (draft: any, previous: any) => {
  if (!draft || typeof draft !== "object") {
    return draft;
  }
  if (draft.password !== SECRET_MASK) {
    return draft;
  }
  if (typeof previous?.password === "string") {
    return { ...draft, password: previous.password };
  }
  return { ...draft, password: "" };
};

const resolveMaskedBodhiConfig = (draft: any, previous: any) => {
  const next = cloneJson(draft);
  if (next.http_proxy_auth) {
    next.http_proxy_auth = resolveMaskedProxyAuth(
      next.http_proxy_auth,
      previous?.http_proxy_auth,
    );
  }
  if (next.https_proxy_auth) {
    next.https_proxy_auth = resolveMaskedProxyAuth(
      next.https_proxy_auth,
      previous?.https_proxy_auth,
    );
  }
  return next;
};

export interface McpStatusResponse {
  name: string;
  status: string;
  message?: string;
}

interface UseSystemSettingsMcpProps {
  msgApi: {
    success: (content: string) => void;
    error: (content: string) => void;
  };
}

export const useSystemSettingsMcp = ({ msgApi }: UseSystemSettingsMcpProps) => {
  const [mcpConfigJson, setMcpConfigJson] = useState("");
  const [mcpConfigError, setMcpConfigError] = useState<string | null>(null);
  const [mcpStatuses, setMcpStatuses] = useState<
    Record<string, McpStatusResponse | null>
  >({});
  const [isLoadingMcp, setIsLoadingMcp] = useState(false);
  const [bodhiConfigJson, setBodhiConfigJson] = useState("");
  const [bodhiConfigError, setBodhiConfigError] = useState<string | null>(null);
  const [isLoadingBodhiConfig, setIsLoadingBodhiConfig] = useState(false);
  const mcpPollingRef = useRef<number | null>(null);
  const mcpDirtyRef = useRef(false);
  const mcpLastConfigRef = useRef("");
  const bodhiConfigPollingRef = useRef<number | null>(null);
  const bodhiConfigDirtyRef = useRef(false);
  const bodhiConfigLastRef = useRef("");
  const bodhiConfigSecretsRef = useRef<any>({});

  const fetchMcpConfig = async () => {
    const config = await serviceFactory.getMcpServers();
    return config ?? { mcpServers: {} };
  };

  const fetchBodhiConfig = async () => {
    const config = await serviceFactory.getBodhiConfig();
    return config ?? {};
  };

  const refreshMcpStatuses = async (config: any) => {
    const serverNames = Object.keys(config?.mcpServers ?? {});
    if (serverNames.length === 0) {
      setMcpStatuses({});
      return;
    }
    const entries = await Promise.all(
      serverNames.map(async (name) => {
        try {
          const status = await serviceFactory.getMcpClientStatus(name);
          return [name, status as McpStatusResponse] as const;
        } catch {
          return [name, null] as const;
        }
      }),
    );
    setMcpStatuses(Object.fromEntries(entries));
  };

  const applyMcpConfig = async (config: any, force = false) => {
    const json = JSON.stringify(config ?? { mcpServers: {} }, null, 2);
    if (force || !mcpDirtyRef.current) {
      setMcpConfigJson(json);
    }
    mcpDirtyRef.current = false;
    mcpLastConfigRef.current = json;
    await refreshMcpStatuses(config);
  };

  const applyBodhiConfig = async (config: any, force = false) => {
    const raw = JSON.stringify(config ?? {}, null, 2);
    const masked = JSON.stringify(maskBodhiConfig(config ?? {}), null, 2);
    if (force || !bodhiConfigDirtyRef.current) {
      setBodhiConfigJson(masked);
    }
    bodhiConfigDirtyRef.current = false;
    bodhiConfigLastRef.current = raw;
    bodhiConfigSecretsRef.current = cloneJson(config ?? {});
  };

  const loadMcpConfig = async () => {
    setIsLoadingMcp(true);
    setMcpConfigError(null);
    try {
      const config = await fetchMcpConfig();
      await applyMcpConfig(config, true);
    } catch (error) {
      setMcpConfigError(
        error instanceof Error
          ? error.message
          : "Failed to load MCP configuration",
      );
    } finally {
      setIsLoadingMcp(false);
    }
  };

  const loadBodhiConfig = async () => {
    setIsLoadingBodhiConfig(true);
    setBodhiConfigError(null);
    try {
      const config = await fetchBodhiConfig();
      await applyBodhiConfig(config, true);
    } catch (error) {
      setBodhiConfigError(
        error instanceof Error ? error.message : "Failed to load Bodhi config",
      );
    } finally {
      setIsLoadingBodhiConfig(false);
    }
  };

  const reloadMcpConfig = async () => {
    return await serviceFactory.reloadMcpServers();
  };

  const reloadBodhiConfig = async () => {
    const config = await fetchBodhiConfig();
    await applyBodhiConfig(config, true);
  };

  const pollMcpConfig = async () => {
    try {
      const config = await fetchMcpConfig();
      const json = JSON.stringify(config ?? { mcpServers: {} }, null, 2);
      if (!mcpDirtyRef.current && json !== mcpLastConfigRef.current) {
        const reloaded = await reloadMcpConfig();
        await applyMcpConfig(reloaded, true);
        return;
      }
      await applyMcpConfig(config);
    } catch {}
  };

  const pollBodhiConfig = async () => {
    try {
      const config = await fetchBodhiConfig();
      const raw = JSON.stringify(config ?? {}, null, 2);
      if (!bodhiConfigDirtyRef.current && raw !== bodhiConfigLastRef.current) {
        await applyBodhiConfig(config, true);
        return;
      }
      await applyBodhiConfig(config);
    } catch {}
  };

  const handleSaveMcpConfig = async () => {
    try {
      const parsed = JSON.parse(mcpConfigJson);
      await serviceFactory.setMcpServers(parsed);
      msgApi.success("MCP configuration saved");
      mcpDirtyRef.current = false;
      mcpLastConfigRef.current = JSON.stringify(parsed, null, 2);
      await loadMcpConfig();
    } catch (error) {
      msgApi.error(
        error instanceof Error
          ? error.message
          : "Failed to save MCP configuration",
      );
    }
  };

  const handleSaveBodhiConfig = async () => {
    try {
      const parsed = JSON.parse(bodhiConfigJson || "{}");
      const resolved = resolveMaskedBodhiConfig(
        parsed,
        bodhiConfigSecretsRef.current,
      );
      await serviceFactory.setBodhiConfig(resolved);
      msgApi.success("Bodhi config saved");
      bodhiConfigDirtyRef.current = false;
      bodhiConfigLastRef.current = JSON.stringify(resolved, null, 2);
      await loadBodhiConfig();
    } catch (error) {
      msgApi.error(
        error instanceof Error ? error.message : "Failed to save Bodhi config",
      );
    }
  };

  const formatMcpStatus = (status: McpStatusResponse | null) => {
    if (!status) return "unknown";
    if (status.status === "error") {
      return status.message ? `error: ${status.message}` : "error";
    }
    return status.status;
  };

  useEffect(() => {
    loadMcpConfig();
    loadBodhiConfig();
    if (!mcpPollingRef.current) {
      mcpPollingRef.current = window.setInterval(() => {
        void pollMcpConfig();
      }, 5000);
    }
    if (!bodhiConfigPollingRef.current) {
      bodhiConfigPollingRef.current = window.setInterval(() => {
        void pollBodhiConfig();
      }, 5000);
    }
    return () => {
      if (mcpPollingRef.current) {
        window.clearInterval(mcpPollingRef.current);
        mcpPollingRef.current = null;
      }
      if (bodhiConfigPollingRef.current) {
        window.clearInterval(bodhiConfigPollingRef.current);
        bodhiConfigPollingRef.current = null;
      }
    };
  }, []);

  return {
    mcpConfigJson,
    setMcpConfigJson,
    mcpConfigError,
    mcpStatuses,
    isLoadingMcp,
    bodhiConfigJson,
    setBodhiConfigJson,
    bodhiConfigError,
    isLoadingBodhiConfig,
    handleSaveMcpConfig,
    handleSaveBodhiConfig,
    reloadMcpConfig,
    applyMcpConfig,
    applyBodhiConfig,
    reloadBodhiConfig,
    formatMcpStatus,
    mcpDirtyRef,
    bodhiConfigDirtyRef,
  };
};
