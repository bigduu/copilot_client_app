export const PROXY_AUTH_STORAGE_KEY = "bodhi_proxy_auth";

export interface ProxyAuthCredentials {
  username: string;
  password: string;
}

export const readStoredProxyAuth = (): ProxyAuthCredentials | null => {
  try {
    const raw = localStorage.getItem(PROXY_AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const username =
      typeof parsed.username === "string" ? parsed.username.trim() : "";
    const password = typeof parsed.password === "string" ? parsed.password : "";

    if (!username) {
      return null;
    }

    return { username, password };
  } catch {
    return null;
  }
};

export const writeStoredProxyAuth = (auth: ProxyAuthCredentials): void => {
  localStorage.setItem(
    PROXY_AUTH_STORAGE_KEY,
    JSON.stringify({
      username: auth.username,
      password: auth.password,
    }),
  );
};

export const clearStoredProxyAuth = (): void => {
  localStorage.removeItem(PROXY_AUTH_STORAGE_KEY);
};
