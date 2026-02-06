import { useCallback, useEffect, useRef, useState } from "react";
import { serviceFactory } from "../../../AgentPage/services/ServiceFactory";

interface UseSystemSettingsProxyAuthProps {
  msgApi: {
    success: (content: string) => void;
    error: (content: string) => void;
  };
}

export const useSystemSettingsProxyAuth = ({
  msgApi,
}: UseSystemSettingsProxyAuthProps) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const lastPushedRef = useRef<string>("");
  const isFirstLoadRef = useRef(true);

  const pushProxyAuthValues = useCallback(
    async (auth: { username: string; password: string }, force = false) => {
      const serialized = JSON.stringify(auth);
      if (!force && serialized === lastPushedRef.current) {
        return { ok: true, error: null as string | null };
      }
      try {
        await serviceFactory.setProxyAuth(auth);
        lastPushedRef.current = serialized;
        setLastError(null);
        return { ok: true, error: null as string | null };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to update proxy auth";
        setLastError(message);
        return { ok: false, error: message };
      }
    },
    [],
  );

  const pushCurrentProxyAuth = useCallback(
    async (force = false) => {
      return await pushProxyAuthValues({ username, password }, force);
    },
    [password, pushProxyAuthValues, username],
  );

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    const result = await pushCurrentProxyAuth(true);
    if (result.ok) {
      msgApi.success("Proxy auth saved");
    } else {
      msgApi.error(result.error || "Failed to update proxy auth");
    }
    setIsSaving(false);
  }, [msgApi, pushCurrentProxyAuth]);

  const handleClear = useCallback(async () => {
    setUsername("");
    setPassword("");
    const result = await pushProxyAuthValues({ username: "", password: "" }, true);
    if (!result.ok && result.error) {
      msgApi.error(result.error);
      return;
    }
    msgApi.success("Proxy auth cleared");
  }, [msgApi, pushProxyAuthValues]);

  // Load proxy auth from backend config on first mount
  useEffect(() => {
    if (!isFirstLoadRef.current) return;
    isFirstLoadRef.current = false;
    
    const loadProxyAuthFromConfig = async () => {
      try {
        const config = await serviceFactory.getBodhiConfig();
        // Note: backend strips proxy auth from config for security
        // User needs to manually enter proxy auth
        // This is intentional - we don't want to expose proxy auth to frontend
      } catch (error) {
        console.error("Failed to load config:", error);
      }
    };
    
    void loadProxyAuthFromConfig();
    // Note: We don't auto-push proxy auth on mount anymore
    // User must explicitly click Save
  }, []);

  return {
    username,
    password,
    setUsername,
    setPassword,
    handleSave,
    handleClear,
    isSaving,
    lastError,
  };
};