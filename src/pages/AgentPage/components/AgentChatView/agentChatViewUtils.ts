import type { ClaudeContentPart, ClaudeStreamMessage } from "../ClaudeStream";

export const normalizeContentParts = (value: any): ClaudeContentPart[] => {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.filter(Boolean) as ClaudeContentPart[];
  }

  if (typeof value === "string") {
    return [{ type: "text", text: value }];
  }

  if (typeof value === "object") {
    const obj: any = value;
    if (typeof obj.type !== "string" && typeof obj.text === "string") {
      return [{ ...obj, type: "text" } as ClaudeContentPart];
    }
    return [obj as ClaudeContentPart];
  }

  return [];
};

export const isTextPart = (
  part: ClaudeContentPart,
): part is { type: "text"; text?: string } => (part as any)?.type === "text";

export const getTextValue = (part: any): string => {
  const raw = part?.text;
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && typeof raw.text === "string")
    return raw.text;
  if (raw === undefined || raw === null) return "";
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
};

export const isToolUsePart = (
  part: ClaudeContentPart,
): part is Extract<ClaudeContentPart, { type: "tool_use" }> =>
  (part as any)?.type === "tool_use";

export const isToolResultPart = (
  part: ClaudeContentPart,
): part is Extract<ClaudeContentPart, { type: "tool_result" }> =>
  (part as any)?.type === "tool_result";

export const extractTextFromParts = (parts: ClaudeContentPart[]): string[] => {
  return parts
    .filter((p) => isTextPart(p))
    .map((p: any) => getTextValue(p))
    .filter((t) => t.trim().length > 0);
};

export const buildToolResultsMap = (
  entries: ClaudeStreamMessage[],
): Map<string, any> => {
  const map = new Map<string, any>();
  entries.forEach((entry) => {
    const parts = normalizeContentParts(entry.message?.content);
    parts.forEach((part: any) => {
      if (
        part?.type === "tool_result" &&
        typeof part.tool_use_id === "string"
      ) {
        map.set(part.tool_use_id, part);
      }
    });
  });
  return map;
};

export const getStableEntryKey = (
  entry: ClaudeStreamMessage,
  fallbackIdx: number,
): string => {
  const sid = entry.session_id ?? entry.sessionId ?? "";
  const uuid = (entry as any)?.uuid as string | undefined;
  if (uuid) return `${sid}|uuid|${uuid}`;
  const messageId = entry.message?.id;
  if (messageId) return `${sid}|mid|${messageId}`;
  const ts = entry.timestamp ?? "";
  const type = entry.type ?? "";
  const subtype = entry.subtype ?? "";
  if (ts || type || subtype || sid) return `${sid}|${type}|${subtype}|${ts}`;
  return `fallback-${fallbackIdx}`;
};

export const isToolResultOnlyUserEntry = (
  entry: ClaudeStreamMessage,
): boolean => {
  const parts = normalizeContentParts(entry.message?.content);
  if (!parts.length) return false;
  if (entry.message?.role !== "user") return false;
  return parts.every((p) => (p as any)?.type === "tool_result");
};

export const inferRole = (
  entry: ClaudeStreamMessage,
): "user" | "assistant" | "system" => {
  const role =
    entry.message?.role ??
    (entry.type === "user" || entry.type === "assistant" ? entry.type : null);
  if (role === "user" || role === "assistant") return role;
  return "system";
};

export const isSystemInitEntry = (entry: ClaudeStreamMessage): boolean =>
  entry.type === "system" && entry.subtype === "init";
