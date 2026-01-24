import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { listen } from "@tauri-apps/api/event";

import type { ClaudeStreamMessage } from "../ClaudeStream";
import { AgentSessionPersistenceService } from "../../services/AgentSessionPersistenceService";
import { deriveProjectId } from "./agentViewUtils";

type UseAgentStreamListenersArgs = {
  appendOutputLine: (line: string) => void;
  bumpSessionsRefreshNonce: () => void;
  debugLog: (...args: any[]) => void;
  isMountedRef: MutableRefObject<boolean>;
  loadSessionHistory: () => Promise<number>;
  outputLineCountRef: MutableRefObject<number>;
  resolvedProjectPath: string | null;
  runNextQueuedPromptRef: MutableRefObject<() => void>;
  runSessionIdRef: MutableRefObject<string | null>;
  sawAssistantRef: MutableRefObject<boolean>;
  selectedProjectId: string | null;
  selectedSessionId: string | null;
  setError: (
    value: string | null | ((prev: string | null) => string | null),
  ) => void;
  setIsRunning: (value: boolean) => void;
  setRunSessionId: (value: string | null) => void;
  setSelectedSessionId: (id: string | null) => void;
  updateLocalPromptSessionId: (sid: string) => void;
};

export const useAgentStreamListeners = ({
  appendOutputLine,
  bumpSessionsRefreshNonce,
  debugLog,
  isMountedRef,
  loadSessionHistory,
  outputLineCountRef,
  resolvedProjectPath,
  runNextQueuedPromptRef,
  runSessionIdRef,
  sawAssistantRef,
  selectedProjectId,
  selectedSessionId,
  setError,
  setIsRunning,
  setRunSessionId,
  setSelectedSessionId,
  updateLocalPromptSessionId,
}: UseAgentStreamListenersArgs) => {
  const unlistenGenericRef = useRef<Array<() => void>>([]);
  const unlistenScopedRef = useRef<Array<() => void>>([]);

  const cleanupListeners = useCallback(() => {
    unlistenGenericRef.current.forEach((u) => u());
    unlistenGenericRef.current = [];
    unlistenScopedRef.current.forEach((u) => u());
    unlistenScopedRef.current = [];
  }, []);

  useEffect(() => cleanupListeners, [cleanupListeners]);

  const attachScopedListeners = useCallback(
    async (sid: string) => {
      debugLog("attachScopedListeners", sid);
      const outputUnlisten = await listen<string>(
        `claude-output:${sid}`,
        (evt) => {
          appendOutputLine(evt.payload);
        },
      );

      const errorUnlisten = await listen<string>(
        `claude-error:${sid}`,
        (evt) => {
          if (!isMountedRef.current) return;
          setError(evt.payload);
        },
      );

      const completeUnlisten = await listen<boolean>(
        `claude-complete:${sid}`,
        (evt) => {
          if (!isMountedRef.current) return;
          debugLog("claude-complete scoped", { sid, ok: evt.payload });
          setIsRunning(false);
          cleanupListeners();
          if (evt.payload === false) {
            setError((prev) => prev ?? "Claude run failed");
          } else if (!sawAssistantRef.current) {
            const message = outputLineCountRef.current
              ? "Claude returned no assistant output"
              : "Claude returned no output";
            setError((prev) => prev ?? message);
          }
          bumpSessionsRefreshNonce();
          void (async () => {
            const count = await loadSessionHistory();
            if (count > 1) return;
            setTimeout(() => {
              if (!isMountedRef.current) return;
              void loadSessionHistory();
            }, 250);
          })();
          runNextQueuedPromptRef.current();
        },
      );

      unlistenScopedRef.current = [
        outputUnlisten,
        errorUnlisten,
        completeUnlisten,
      ];

      unlistenGenericRef.current.forEach((u) => u());
      unlistenGenericRef.current = [];
    },
    [
      appendOutputLine,
      bumpSessionsRefreshNonce,
      cleanupListeners,
      debugLog,
      isMountedRef,
      loadSessionHistory,
      outputLineCountRef,
      runNextQueuedPromptRef,
      sawAssistantRef,
      setError,
      setIsRunning,
    ],
  );

  const attachGenericListeners = useCallback(async () => {
    debugLog("attachGenericListeners");
    const outputUnlisten = await listen<string>("claude-output", (evt) => {
      appendOutputLine(evt.payload);

      if (runSessionIdRef.current) return;
      try {
        const msg = JSON.parse(evt.payload) as ClaudeStreamMessage;
        if (msg.type === "system" && msg.subtype === "init" && msg.session_id) {
          debugLog("system:init", {
            emittedSessionId: msg.session_id,
            previousSelectedSessionId: selectedSessionId,
          });
          runSessionIdRef.current = msg.session_id;
          setRunSessionId(msg.session_id);
          setSelectedSessionId(msg.session_id);
          updateLocalPromptSessionId(msg.session_id);
          attachScopedListeners(msg.session_id);
          const projectPath = resolvedProjectPath;
          const projectId =
            selectedProjectId ?? deriveProjectId(projectPath ?? undefined);
          if (projectId && projectPath) {
            AgentSessionPersistenceService.saveSession(
              msg.session_id,
              projectId,
              projectPath,
            );
          }
        }
      } catch {
        return;
      }
    });

    const errorUnlisten = await listen<string>("claude-error", (evt) => {
      if (!isMountedRef.current) return;
      setError(evt.payload);
      const payload = JSON.stringify({
        type: "system",
        subtype: "stderr",
        timestamp: new Date().toISOString(),
        message: {
          role: "system",
          content: [{ type: "text", text: evt.payload }],
        },
      });
      appendOutputLine(payload);
    });

    const completeUnlisten = await listen<boolean>("claude-complete", (evt) => {
      if (!isMountedRef.current) return;
      debugLog("claude-complete generic", { ok: evt.payload });
      setIsRunning(false);
      cleanupListeners();
      if (evt.payload === false) {
        setError((prev) => prev ?? "Claude run failed");
      } else if (!sawAssistantRef.current) {
        const message = outputLineCountRef.current
          ? "Claude returned no assistant output"
          : "Claude returned no output";
        setError((prev) => prev ?? message);
      }
      bumpSessionsRefreshNonce();
      void (async () => {
        const count = await loadSessionHistory();
        if (count > 1) return;
        setTimeout(() => {
          if (!isMountedRef.current) return;
          void loadSessionHistory();
        }, 250);
      })();
      runNextQueuedPromptRef.current();
    });

    unlistenGenericRef.current = [
      outputUnlisten,
      errorUnlisten,
      completeUnlisten,
    ];
  }, [
    appendOutputLine,
    attachScopedListeners,
    bumpSessionsRefreshNonce,
    cleanupListeners,
    debugLog,
    isMountedRef,
    loadSessionHistory,
    outputLineCountRef,
    resolvedProjectPath,
    runNextQueuedPromptRef,
    runSessionIdRef,
    sawAssistantRef,
    selectedProjectId,
    selectedSessionId,
    setError,
    setIsRunning,
    setRunSessionId,
    setSelectedSessionId,
    updateLocalPromptSessionId,
  ]);

  return {
    attachGenericListeners,
    attachScopedListeners,
    cleanupListeners,
  };
};
