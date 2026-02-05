import { useCallback, useEffect, useRef, useState } from "react";
import { serviceFactory } from "../../../AgentPage/services/ServiceFactory";

const STORAGE_KEY = "bodhi_proxy_auth";

const readStoredAuth = () => {
  if (typeof window === "undefined") return { username: "", password: "" };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { username: "", password: "" };
    const parsed = JSON.parse(raw);
    return {
      username: typeof parsed?.username === "string" ? parsed.username : "",
      password: typeof parsed?.password === "string" ? parsed.password : "",
    };
  } catch {
    return { username: "", password: "" };
  }
};

const storeAuth = (auth: { username: string; password: string }) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
};

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

  useEffect(() => {
    const stored = readStoredAuth();
    setUsername(stored.username);
    setPassword(stored.password);
    void pushProxyAuthValues(stored, true);
  }, [pushProxyAuthValues]);

  useEffect(() => {
    storeAuth({ username, password });
  }, [password, username]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void pushCurrentProxyAuth(false);
    }, 10000);
    return () => window.clearInterval(interval);
  }, [pushCurrentProxyAuth]);

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
