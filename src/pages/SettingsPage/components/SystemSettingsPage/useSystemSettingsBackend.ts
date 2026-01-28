import { useEffect, useState } from "react";
import {
  clearBackendBaseUrlOverride,
  getBackendBaseUrl,
  getDefaultBackendBaseUrl,
  hasBackendBaseUrlOverride,
  normalizeBackendBaseUrl,
  setBackendBaseUrl,
} from "../../../../shared/utils/backendBaseUrl";

interface UseSystemSettingsBackendProps {
  msgApi: {
    error: (content: string) => void;
    success: (content: string) => void;
  };
  refreshModels: () => Promise<void>;
}

export const useSystemSettingsBackend = ({
  msgApi,
  refreshModels,
}: UseSystemSettingsBackendProps) => {
  const [backendBaseUrl, setBackendBaseUrlState] =
    useState(getBackendBaseUrl());
  const [hasBackendOverride, setHasBackendOverride] = useState(
    hasBackendBaseUrlOverride(),
  );

  useEffect(() => {
    setBackendBaseUrlState(getBackendBaseUrl());
    setHasBackendOverride(hasBackendBaseUrlOverride());
  }, []);

  const validateBackendUrl = (value: string): string | null => {
    const normalized = normalizeBackendBaseUrl(value);
    if (!normalized) {
      return "Backend URL cannot be empty";
    }

    try {
      const parsed = new URL(normalized);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return "Backend URL must start with http:// or https://";
      }
    } catch {
      return "Backend URL is not a valid URL";
    }

    if (!normalized.endsWith("/v1")) {
      return 'Backend URL must end with \"/v1\"';
    }

    return null;
  };

  const handleSaveBackendBaseUrl = async () => {
    const error = validateBackendUrl(backendBaseUrl);
    if (error) {
      msgApi.error(error);
      return;
    }

    const normalized = normalizeBackendBaseUrl(backendBaseUrl);
    setBackendBaseUrl(normalized);
    setBackendBaseUrlState(normalized);
    setHasBackendOverride(true);
    msgApi.success("Backend URL saved");

    try {
      await refreshModels();
    } catch {}
  };

  const handleResetBackendBaseUrl = async () => {
    clearBackendBaseUrlOverride();
    setBackendBaseUrlState(getDefaultBackendBaseUrl());
    setHasBackendOverride(false);
    msgApi.success("Backend URL reset to default");

    try {
      await refreshModels();
    } catch {}
  };

  return {
    backendBaseUrl,
    setBackendBaseUrlState,
    hasBackendOverride,
    handleSaveBackendBaseUrl,
    handleResetBackendBaseUrl,
  };
};
