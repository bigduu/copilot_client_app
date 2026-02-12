const BACKEND_BASE_URL_KEY = "copilot_backend_base_url";

const FALLBACK_BACKEND_BASE_URL = "http://127.0.0.1:8080/v1";

export const normalizeBackendBaseUrl = (value: string): string =>
  value.trim().replace(/\/+$/, "");

export const getDefaultBackendBaseUrl = (): string => {
  const processEnvUrl = (globalThis as any).process?.env
    ?.VITE_BACKEND_BASE_URL as string | undefined;
  const envUrl =
    (import.meta.env.VITE_BACKEND_BASE_URL as string | undefined) ??
    processEnvUrl;
  if (envUrl) {
    return normalizeBackendBaseUrl(envUrl);
  }
  return FALLBACK_BACKEND_BASE_URL;
};

export const getBackendBaseUrl = (): string => {
  const stored = localStorage.getItem(BACKEND_BASE_URL_KEY);
  if (stored) {
    const normalized = normalizeBackendBaseUrl(stored);
    // Validate the URL before returning
    try {
      new URL(normalized);
      return normalized;
    } catch (e) {
      console.warn("Invalid stored backend URL, using default:", normalized);
      localStorage.removeItem(BACKEND_BASE_URL_KEY);
    }
  }
  return getDefaultBackendBaseUrl();
};

export const setBackendBaseUrl = (value: string): void => {
  localStorage.setItem(BACKEND_BASE_URL_KEY, normalizeBackendBaseUrl(value));
};

export const clearBackendBaseUrlOverride = (): void => {
  localStorage.removeItem(BACKEND_BASE_URL_KEY);
};

export const hasBackendBaseUrlOverride = (): boolean =>
  localStorage.getItem(BACKEND_BASE_URL_KEY) !== null;

export const buildBackendUrl = (path: string): string => {
  const baseUrl = getBackendBaseUrl().replace(/\/+$/, "");
  const cleanPath = path.replace(/^\/+/, "");
  return `${baseUrl}/${cleanPath}`;
};
