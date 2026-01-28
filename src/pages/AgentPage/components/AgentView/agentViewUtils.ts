export const deriveProjectId = (path?: string | null) => {
  if (!path) return "";
  return path.replace(/\//g, "-");
};

export const getErrorMessage = (e: unknown, fallback: string) => {
  if (e instanceof Error) return e.message || fallback;
  if (typeof e === "string") return e || fallback;
  const message = (e as any)?.message;
  if (message) return String(message);
  try {
    return JSON.stringify(e);
  } catch {
    return fallback;
  }
};

export const extractSessionId = (info: any): string | null => {
  const pt = info?.process_type ?? info?.processType;
  if (!pt) return null;
  if (pt.ClaudeSession?.session_id) return pt.ClaudeSession.session_id;
  if (pt.ClaudeSession?.sessionId) return pt.ClaudeSession.sessionId;
  if (pt.session_id) return pt.session_id;
  if (pt.sessionId) return pt.sessionId;
  return null;
};
