import { useEffect, useRef, useState } from "react";
import { serviceFactory } from "../../../AgentPage/services/ServiceFactory";

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

interface UseSystemSettingsBodhiConfigProps {
  msgApi: {
    success: (content: string) => void;
    error: (content: string) => void;
  };
}

export const useSystemSettingsBodhiConfig = ({
  msgApi,
}: UseSystemSettingsBodhiConfigProps) => {
  const [bodhiConfigJson, setBodhiConfigJson] = useState("");
  const [bodhiConfigError, setBodhiConfigError] = useState<string | null>(null);
  const [isLoadingBodhiConfig, setIsLoadingBodhiConfig] = useState(false);
  const bodhiConfigPollingRef = useRef<number | null>(null);
  const bodhiConfigDirtyRef = useRef(false);
  const bodhiConfigLastRef = useRef("");
  const bodhiConfigSecretsRef = useRef<any>({});

  const fetchBodhiConfig = async () => {
    const config = await serviceFactory.getBodhiConfig();
    return config ?? {};
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

  const reloadBodhiConfig = async () => {
    const config = await fetchBodhiConfig();
    await applyBodhiConfig(config, true);
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

  useEffect(() => {
    loadBodhiConfig();
    if (!bodhiConfigPollingRef.current) {
      bodhiConfigPollingRef.current = window.setInterval(() => {
        void pollBodhiConfig();
      }, 5000);
    }
    return () => {
      if (bodhiConfigPollingRef.current) {
        window.clearInterval(bodhiConfigPollingRef.current);
        bodhiConfigPollingRef.current = null;
      }
    };
  }, []);

  return {
    bodhiConfigJson,
    setBodhiConfigJson,
    bodhiConfigError,
    isLoadingBodhiConfig,
    handleSaveBodhiConfig,
    reloadBodhiConfig,
    bodhiConfigDirtyRef,
  };
};
