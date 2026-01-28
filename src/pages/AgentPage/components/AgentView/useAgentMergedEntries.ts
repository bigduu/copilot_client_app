import { useMemo } from "react";

import type { ClaudeStreamMessage } from "../ClaudeStream";

type UseAgentMergedEntriesArgs = {
  history: ClaudeStreamMessage[];
  liveEntries: ClaudeStreamMessage[];
  runSessionId: string | null;
  selectedSessionId: string | null;
};

export const useAgentMergedEntries = ({
  history,
  liveEntries,
  runSessionId,
  selectedSessionId,
}: UseAgentMergedEntriesArgs) => {
  return useMemo(() => {
    const activeSessionId = runSessionId ?? selectedSessionId;
    const combined = [...history, ...liveEntries].map((entry, index) => ({
      entry,
      index,
    }));

    const filtered = combined.filter(({ entry, index }) => {
      if (!activeSessionId) return true;
      if (index < history.length) return true;
      const sid = entry.session_id ?? entry.sessionId;
      if (!sid) return true;
      return sid === activeSessionId;
    });

    const latestIndex = new Map<string, number>();
    const keys: string[] = new Array(filtered.length);
    filtered.forEach(({ entry, index }, i) => {
      const sid = entry.session_id ?? entry.sessionId ?? "";
      const uuid = (entry as any)?.uuid as string | undefined;
      const messageId = entry.message?.id;
      const key = uuid
        ? `${sid}|uuid|${uuid}`
        : messageId
          ? `${sid}|mid|${messageId}`
          : `${sid}|${entry.type ?? ""}|${entry.subtype ?? ""}|${entry.timestamp ?? ""}|${index}`;
      keys[i] = key;
      latestIndex.set(key, i);
    });

    const sortedEntries = filtered
      .filter((_, i) => latestIndex.get(keys[i]) === i)
      .map((x) => x.entry);
    const extractUserText = (entry: ClaudeStreamMessage): string | null => {
      if (entry.message?.role !== "user") return null;
      const c = entry.message?.content;
      if (typeof c === "string") return c.trim() || null;
      if (Array.isArray(c)) {
        const texts = c
          .filter((p: any) => p?.type === "text" && typeof p?.text === "string")
          .map((p: any) => (p.text as string).trim())
          .filter(Boolean);
        const joined = texts.join("\n").trim();
        return joined || null;
      }
      return null;
    };

    const normalizeText = (value: string) => value.replace(/\s+/g, " ").trim();
    const nonLocalUserTimes = new Map<string, number[]>();
    sortedEntries.forEach((e: any) => {
      if (e?.local_prompt) return;
      const text = extractUserText(e);
      if (!text) return;
      const ts = Date.parse(e.timestamp ?? "");
      if (!Number.isFinite(ts)) return;
      const key = normalizeText(text);
      const list = nonLocalUserTimes.get(key) ?? [];
      list.push(ts);
      nonLocalUserTimes.set(key, list);
    });

    const isLocalDup = (e: any): boolean => {
      if (!e?.local_prompt) return false;
      const text = extractUserText(e);
      if (!text) return false;
      const localTs = Date.parse(e.timestamp ?? "");
      if (!Number.isFinite(localTs)) return false;
      const list = nonLocalUserTimes.get(normalizeText(text));
      if (!list || !list.length) return false;
      return list.some((t) => Math.abs(t - localTs) <= 10_000);
    };

    return sortedEntries.filter((e: any) => !isLocalDup(e));
  }, [history, liveEntries, runSessionId, selectedSessionId]);
};
