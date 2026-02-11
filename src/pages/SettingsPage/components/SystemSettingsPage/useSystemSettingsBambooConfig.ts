import { useEffect, useRef, useState } from "react";
import { serviceFactory } from "../../../../services/common/ServiceFactory";

const cloneJson = (value: any) => {
  try {
    return JSON.parse(JSON.stringify(value ?? {}));
  } catch {
    return {};
  }
};

interface UseSystemSettingsBambooConfigProps {
  msgApi: {
    success: (content: string) => void;
    error: (content: string) => void;
  };
}

export const useSystemSettingsBambooConfig = ({
  msgApi,
}: UseSystemSettingsBambooConfigProps) => {
  const [bambooConfigJson, setBambooConfigJson] = useState("");
  const [bambooConfigError, setBambooConfigError] = useState<string | null>(null);
  const [isLoadingBambooConfig, setIsLoadingBambooConfig] = useState(false);
  const bambooConfigPollingRef = useRef<number | null>(null);
  const bambooConfigDirtyRef = useRef(false);
  const bambooConfigLastRef = useRef("");

  const fetchBambooConfig = async () => {
    const config = await serviceFactory.getBambooConfig();
    return config ?? {};
  };

  const applyBambooConfig = async (config: any, force = false) => {
    const raw = JSON.stringify(config ?? {}, null, 2);
    if (force || !bambooConfigDirtyRef.current) {
      setBambooConfigJson(raw);
    }
    bambooConfigDirtyRef.current = false;
    bambooConfigLastRef.current = raw;
  };

  const loadBambooConfig = async () => {
    setIsLoadingBambooConfig(true);
    setBambooConfigError(null);
    try {
      const config = await fetchBambooConfig();
      await applyBambooConfig(config, true);
    } catch (error) {
      setBambooConfigError(
        error instanceof Error ? error.message : "Failed to load Bamboo config",
      );
    } finally {
      setIsLoadingBambooConfig(false);
    }
  };

  const reloadBambooConfig = async () => {
    const config = await fetchBambooConfig();
    await applyBambooConfig(config, true);
  };

  const pollBambooConfig = async () => {
    try {
      const config = await fetchBambooConfig();
      const raw = JSON.stringify(config ?? {}, null, 2);
      if (!bambooConfigDirtyRef.current && raw !== bambooConfigLastRef.current) {
        await applyBambooConfig(config, true);
        return;
      }
      await applyBambooConfig(config);
    } catch {}
  };

  const handleSaveBambooConfig = async () => {
    try {
      const parsed = JSON.parse(bambooConfigJson || "{}");
      const resolved = cloneJson(parsed);
      await serviceFactory.setBambooConfig(resolved);
      msgApi.success("Bamboo config saved");
      bambooConfigDirtyRef.current = false;
      bambooConfigLastRef.current = JSON.stringify(resolved, null, 2);
      await loadBambooConfig();
    } catch (error) {
      msgApi.error(
        error instanceof Error ? error.message : "Failed to save Bamboo config",
      );
    }
  };

  useEffect(() => {
    loadBambooConfig();
    if (!bambooConfigPollingRef.current) {
      bambooConfigPollingRef.current = window.setInterval(() => {
        void pollBambooConfig();
      }, 5000);
    }
    return () => {
      if (bambooConfigPollingRef.current) {
        window.clearInterval(bambooConfigPollingRef.current);
        bambooConfigPollingRef.current = null;
      }
    };
  }, []);

  return {
    bambooConfigJson,
    setBambooConfigJson,
    bambooConfigError,
    isLoadingBambooConfig,
    handleSaveBambooConfig,
    reloadBambooConfig,
    bambooConfigDirtyRef,
  };
};
