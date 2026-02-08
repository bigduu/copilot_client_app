import { useEffect, useRef, useState } from "react";
import { serviceFactory } from "../../../../services/common/ServiceFactory";

const cloneJson = (value: any) => {
  try {
    return JSON.parse(JSON.stringify(value ?? {}));
  } catch {
    return {};
  }
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

  const fetchBodhiConfig = async () => {
    const config = await serviceFactory.getBodhiConfig();
    return config ?? {};
  };

  const applyBodhiConfig = async (config: any, force = false) => {
    const raw = JSON.stringify(config ?? {}, null, 2);
    if (force || !bodhiConfigDirtyRef.current) {
      setBodhiConfigJson(raw);
    }
    bodhiConfigDirtyRef.current = false;
    bodhiConfigLastRef.current = raw;
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
      const resolved = cloneJson(parsed);
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
