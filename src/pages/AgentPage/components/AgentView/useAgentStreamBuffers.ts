import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { ClaudeStreamMessage } from "../ClaudeStream";

type UseAgentStreamBuffersArgs = {
  selectedSessionId: string | null;
  debugLog: (...args: any[]) => void;
  setError: Dispatch<SetStateAction<string | null>>;
};

export const useAgentStreamBuffers = ({
  selectedSessionId,
  debugLog,
  setError,
}: UseAgentStreamBuffersArgs) => {
  const [liveEntries, setLiveEntries] = useState<ClaudeStreamMessage[]>([]);
  const [liveLines, setLiveLines] = useState<string[]>([]);
  const [liveTick, setLiveTick] = useState(0);
  const [view, setView] = useState<"chat" | "debug">("chat");

  const viewRef = useRef(view);
  const isMountedRef = useRef(true);
  const outputLineCountRef = useRef(0);
  const sawAssistantRef = useRef(false);
  const runSessionIdRef = useRef<string | null>(null);
  const seqRef = useRef(0);

  const pendingLinesRef = useRef<string[]>([]);
  const liveLinesBufferRef = useRef<string[]>([]);
  const liveMapRef = useRef<Map<string, ClaudeStreamMessage>>(new Map());
  const liveOrderRef = useRef<string[]>([]);
  const flushTimerRef = useRef<number | null>(null);
  const partialTextRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleViewChange = useCallback((next: "chat" | "debug") => {
    setView(next);
  }, []);

  useEffect(() => {
    viewRef.current = view;
    if (view === "debug") {
      setLiveLines([...liveLinesBufferRef.current]);
    }
  }, [view]);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current !== null) return;
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;
      if (!isMountedRef.current) return;

      if (pendingLinesRef.current.length) {
        const next = pendingLinesRef.current.splice(
          0,
          pendingLinesRef.current.length,
        );
        const merged = [...liveLinesBufferRef.current, ...next];
        liveLinesBufferRef.current =
          merged.length > 2000 ? merged.slice(-2000) : merged;
        if (viewRef.current === "debug") {
          setLiveLines([...liveLinesBufferRef.current]);
        }
      }

      const order = liveOrderRef.current;
      const map = liveMapRef.current;
      const entries = order
        .map((k) => map.get(k))
        .filter(Boolean) as ClaudeStreamMessage[];
      setLiveEntries(entries.length > 800 ? entries.slice(-800) : entries);
      setLiveTick((t) => t + 1);
    }, 75);
  }, []);

  const upsertLiveEntry = useCallback(
    (key: string, entry: ClaudeStreamMessage) => {
      const map = liveMapRef.current;
      if (!map.has(key)) {
        liveOrderRef.current.push(key);
      }
      map.set(key, entry);
      if (liveOrderRef.current.length > 1200) {
        const drop = liveOrderRef.current.splice(
          0,
          liveOrderRef.current.length - 1000,
        );
        drop.forEach((k) => map.delete(k));
      }
    },
    [],
  );

  const updateLocalPromptSessionId = useCallback(
    (sid: string) => {
      const map = liveMapRef.current;
      liveOrderRef.current.forEach((k) => {
        const e: any = map.get(k);
        if (e?.local_prompt && !(e.session_id ?? e.sessionId)) {
          map.set(k, { ...e, sessionId: sid });
        }
      });
      scheduleFlush();
    },
    [scheduleFlush],
  );

  const appendOutputLine = useCallback(
    (line: string) => {
      if (!isMountedRef.current) return;
      outputLineCountRef.current += 1;
      pendingLinesRef.current.push(line);

      try {
        const parsed: any = JSON.parse(line);
        const rawType = parsed?.type;
        const sid =
          parsed?.session_id ??
          parsed?.sessionId ??
          runSessionIdRef.current ??
          selectedSessionId ??
          undefined;

        if (rawType === "partial") {
          sawAssistantRef.current = true;
          const key = `partial:${sid ?? "unknown"}`;
          const existing = partialTextRef.current.get(key) ?? "";
          const prevEntry: any = liveMapRef.current.get(key);
          const chunk =
            typeof parsed?.content === "string"
              ? parsed.content
              : typeof parsed?.message?.content === "string"
                ? parsed.message.content
                : "";

          const next =
            chunk && chunk.startsWith(existing)
              ? chunk
              : existing + (chunk ?? "");
          partialTextRef.current.set(key, next);
          upsertLiveEntry(key, {
            type: "assistant",
            subtype: "partial",
            sessionId: sid,
            timestamp:
              prevEntry?.timestamp ??
              parsed?.timestamp ??
              new Date().toISOString(),
            message: {
              role: "assistant",
              content: [{ type: "text", text: next }],
            },
            is_partial: true,
          } as any);
          scheduleFlush();
          return;
        }

        const msg = parsed as ClaudeStreamMessage;
        const msgRole = msg.message?.role ?? msg.type;
        if (msgRole === "assistant") {
          sawAssistantRef.current = true;
        }
        const uuid = parsed?.uuid as string | undefined;
        const messageId = parsed?.message?.id as string | undefined;
        const key = uuid
          ? `uuid:${uuid}`
          : messageId
            ? `mid:${messageId}`
            : `seq:${seqRef.current++}`;

        upsertLiveEntry(key, msg);

        if (msg.type === "result" && msg.subtype === "error") {
          const message =
            (msg as any).error?.message ??
            (msg as any).error ??
            (msg as any).message ??
            "Claude reported an error";
          debugLog("stream result:error", message, msg);
          setError((prev) => prev ?? String(message));
        }

        scheduleFlush();
      } catch {
        scheduleFlush();
        return;
      }
    },
    [debugLog, scheduleFlush, selectedSessionId, setError, upsertLiveEntry],
  );

  const resetLiveState = useCallback(() => {
    pendingLinesRef.current = [];
    liveLinesBufferRef.current = [];
    liveMapRef.current.clear();
    liveOrderRef.current = [];
    partialTextRef.current.clear();
    setLiveLines([]);
    setLiveEntries([]);
    setLiveTick((t) => t + 1);
  }, []);

  const resetRunSignals = useCallback(() => {
    outputLineCountRef.current = 0;
    sawAssistantRef.current = false;
  }, []);

  const outputText = useMemo(() => liveLines.join("\n"), [liveLines]);

  return {
    appendOutputLine,
    handleViewChange,
    liveEntries,
    liveLines,
    liveTick,
    outputText,
    resetLiveState,
    resetRunSignals,
    runSessionIdRef,
    outputLineCountRef,
    sawAssistantRef,
    scheduleFlush,
    seqRef,
    setLiveEntries,
    setLiveLines,
    updateLocalPromptSessionId,
    upsertLiveEntry,
    view,
    isMountedRef,
  };
};
