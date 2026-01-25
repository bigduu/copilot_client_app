import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { claudeCodeService } from "../../services/ClaudeCodeService";
import { AgentSessionPersistenceService } from "../../services/AgentSessionPersistenceService";
import type { ClaudeStreamMessage } from "../ClaudeStream";
import { useAgentMergedEntries } from "./useAgentMergedEntries";
import { useAgentStreamActions } from "./useAgentStreamActions";
import { useAgentStreamBuffers } from "./useAgentStreamBuffers";
import { useAgentStreamHistory } from "./useAgentStreamHistory";
import { useAgentStreamListeners } from "./useAgentStreamListeners";
import { useAgentStreamReconnect } from "./useAgentStreamReconnect";
import {
  deriveProjectId,
  extractSessionId,
  getErrorMessage,
} from "./agentViewUtils";

type ProjectPathStatus = {
  valid: boolean | null;
  message?: string;
};

type UseAgentStreamStateArgs = {
  selectedProjectId: string | null;
  selectedSessionId: string | null;
  resolvedProjectPath: string | null;
  projectPathStatus: ProjectPathStatus;
  model: string;
  thinkingMode: string;
  promptDraft: string;
  setPromptDraft: (value: string) => void;
  setSelectedProject: (id: string | null, path: string | null) => void;
  setSelectedSessionId: (id: string | null) => void;
  bumpSessionsRefreshNonce: () => void;
  sessionsRefreshNonce: number;
};

type UseAgentStreamStateResult = {
  history: ClaudeStreamMessage[];
  liveEntries: ClaudeStreamMessage[];
  liveLines: string[];
  liveTick: number;
  outputText: string;
  mergedEntries: ClaudeStreamMessage[];
  isRunning: boolean;
  runSessionId: string | null;
  error: string | null;
  view: "chat" | "debug";
  queuedPrompts: { id: string; prompt: string; model: string }[];
  runningSessions: any[];
  runningSessionIds: string[];
  handleViewChange: (next: "chat" | "debug") => void;
  handleSendPrompt: () => void;
  handleAskUserAnswer: (payload: {
    prompt: string;
    sessionId?: string;
  }) => void;
  startRun: () => Promise<void>;
  continueRun: () => Promise<void>;
  resumeRun: () => Promise<void>;
  cancelRun: () => Promise<void>;
  handleRemoveQueuedPrompt: (id: string) => void;
  loadSessionHistory: () => Promise<number>;
  refreshRunningSessions: () => Promise<void>;
  switchSession: (
    sessionId: string | null,
    options?: { projectId?: string | null; projectPath?: string | null },
  ) => Promise<void>;
  clearChatState: () => void;
};

export const useAgentStreamState = ({
  selectedProjectId,
  selectedSessionId,
  resolvedProjectPath,
  projectPathStatus,
  model,
  thinkingMode,
  promptDraft,
  setPromptDraft,
  setSelectedProject,
  setSelectedSessionId,
  bumpSessionsRefreshNonce,
  sessionsRefreshNonce,
}: UseAgentStreamStateArgs): UseAgentStreamStateResult => {
  const debugLog = useCallback((...args: any[]) => {
    if (!import.meta.env.DEV) return;
    console.log("[AgentView]", ...args);
  }, []);

  const [isRunning, setIsRunning] = useState(false);
  const [runSessionId, setRunSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runNextQueuedPromptRef = useRef<() => void>(() => {});
  const [runningSessions, setRunningSessions] = useState<any[]>([]);
  const [pendingStopSessionId, setPendingStopSessionId] = useState<string | null>(
    null,
  );

  const runningSessionIds = useMemo(() => {
    return (runningSessions ?? [])
      .map((info) => extractSessionId(info))
      .filter(Boolean) as string[];
  }, [runningSessions]);

  const refreshRunningSessions = useCallback(async () => {
    try {
      const sessions = await claudeCodeService.listRunningSessions();
      setRunningSessions(sessions ?? []);
    } catch (e) {
      debugLog("listRunningSessions failed", e);
      setRunningSessions([]);
    }
  }, [debugLog]);

  useEffect(() => {
    void refreshRunningSessions();
  }, [refreshRunningSessions, sessionsRefreshNonce]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshRunningSessions();
    }, 5000);
    return () => {
      window.clearInterval(id);
    };
  }, [refreshRunningSessions]);

  const { history, setHistory, loadSessionHistory, loadSessionHistoryFor } =
    useAgentStreamHistory({
      selectedProjectId,
      selectedSessionId,
      debugLog,
      setError,
    });

  const {
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
    updateLocalPromptSessionId,
    upsertLiveEntry,
    view,
    isMountedRef,
  } = useAgentStreamBuffers({
    selectedSessionId,
    debugLog,
    setError,
  });

  const { attachGenericListeners, attachScopedListeners, cleanupListeners } =
    useAgentStreamListeners({
      appendOutputLine,
      bumpSessionsRefreshNonce,
      debugLog,
      isMountedRef,
      loadSessionHistory,
      outputLineCountRef,
      refreshRunningSessions,
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
    });

  useAgentStreamReconnect({
    appendOutputLine,
    attachScopedListeners,
    cleanupListeners,
    debugLog,
    loadSessionHistoryFor,
    resetLiveState,
    runSessionIdRef,
    selectedProjectId,
    selectedSessionId,
    setRunningSessions,
    setIsRunning,
    setRunSessionId,
    setSelectedProject,
    setSelectedSessionId,
  });

  const clearPromptDraft = useCallback(() => {
    setPromptDraft("");
  }, [setPromptDraft]);

  const {
    cancelRun: cancelRunInternal,
    continueRun,
    handleAskUserAnswer,
    handleRemoveQueuedPrompt,
    handleSendPrompt,
    queuedPrompts,
    resumeRun,
    startRun,
  } = useAgentStreamActions({
    attachGenericListeners,
    cleanupListeners,
    clearPromptDraft,
    debugLog,
    isRunning,
    model,
    thinkingMode,
    promptDraft,
    projectPathStatus,
    resolvedProjectPath,
    resetRunSignals,
    resetLiveState,
    runSessionId,
    runSessionIdRef,
    runNextQueuedPromptRef,
    scheduleFlush,
    selectedSessionId,
    seqRef,
    setError,
    setHistory,
    setIsRunning,
    setRunSessionId,
    setSelectedSessionId,
    upsertLiveEntry,
  });

  const cancelRun = useCallback(async () => {
    const targetSessionId = runSessionId ?? selectedSessionId ?? null;
    if (targetSessionId) {
      setPendingStopSessionId(targetSessionId);
      setRunningSessions((prev) =>
        prev.filter((info) => extractSessionId(info) !== targetSessionId),
      );
    }
    await cancelRunInternal();
    setTimeout(() => {
      void refreshRunningSessions();
    }, 600);
  }, [
    cancelRunInternal,
    refreshRunningSessions,
    runSessionId,
    selectedSessionId,
  ]);

  const switchSession = useCallback(
    async (
      sessionId: string | null,
      options?: { projectId?: string | null; projectPath?: string | null },
    ) => {
      if (sessionId === selectedSessionId) return;

      setError(null);
      resetRunSignals();
      resetLiveState();
      setHistory([]);
      setRunSessionId(null);
      runSessionIdRef.current = null;
      cleanupListeners();

      if (!sessionId) {
        setSelectedSessionId(null);
        setIsRunning(false);
        return;
      }

      const sessionInfo = runningSessions.find(
        (info) => extractSessionId(info) === sessionId,
      );
      const overrideProjectPath = options?.projectPath ?? null;
      const overrideProjectId = options?.projectId ?? null;
      const cached = AgentSessionPersistenceService.loadSession(sessionId);
      const infoProjectPath =
        overrideProjectPath ??
        sessionInfo?.project_path ??
        sessionInfo?.projectPath ??
        cached?.projectPath ??
        null;
      const infoProjectId =
        overrideProjectId ??
        cached?.projectId ??
        (infoProjectPath ? deriveProjectId(infoProjectPath) : null);

      if (infoProjectId && infoProjectPath) {
        setSelectedProject(infoProjectId, infoProjectPath);
        AgentSessionPersistenceService.saveSession(
          sessionId,
          infoProjectId,
          infoProjectPath,
        );
      }

      setSelectedSessionId(sessionId);
      runSessionIdRef.current = sessionId;

      if (runningSessionIds.includes(sessionId)) {
        setIsRunning(true);
        setRunSessionId(sessionId);
      } else {
        setIsRunning(false);
      }

      await attachScopedListeners(sessionId);

      try {
        const output = await claudeCodeService.getSessionOutput(sessionId);
        if (output) {
          output
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .forEach((line) => appendOutputLine(line));
        }
      } catch (e) {
        setError(getErrorMessage(e, "Failed to load session output"));
      }

      const projectId =
        infoProjectId ??
        selectedProjectId ??
        deriveProjectId(resolvedProjectPath ?? undefined);
      if (projectId) {
        await loadSessionHistoryFor(projectId, sessionId);
      }
    },
    [
      appendOutputLine,
      attachScopedListeners,
      cleanupListeners,
      loadSessionHistoryFor,
      resetLiveState,
      resetRunSignals,
      resolvedProjectPath,
      runSessionIdRef,
      runningSessions,
      runningSessionIds,
      selectedProjectId,
      selectedSessionId,
      setError,
      setHistory,
      setIsRunning,
      setRunSessionId,
      setSelectedProject,
      setSelectedSessionId,
    ],
  );

  useEffect(() => {
    if (isRunning) return;
    void loadSessionHistory();
  }, [isRunning, loadSessionHistory]);

  useEffect(() => {
    debugLog("state", {
      selectedProjectId,
      selectedSessionId,
      runSessionId,
      isRunning,
      view,
    });
  }, [
    debugLog,
    isRunning,
    runSessionId,
    selectedProjectId,
    selectedSessionId,
    view,
  ]);

  useEffect(() => {
    if (pendingStopSessionId) {
      const stillRunning = runningSessionIds.includes(pendingStopSessionId);
      if (!stillRunning) {
        setPendingStopSessionId(null);
      }
    }

    if (!selectedSessionId) {
      if (isRunning) {
        setIsRunning(false);
        setRunSessionId(null);
      }
      return;
    }

    const running =
      runningSessionIds.includes(selectedSessionId) &&
      selectedSessionId !== pendingStopSessionId;
    if (running && !isRunning) {
      setIsRunning(true);
      setRunSessionId(selectedSessionId);
    }
    if (!running && isRunning) {
      setIsRunning(false);
      setRunSessionId(null);
    }
  }, [
    isRunning,
    pendingStopSessionId,
    runSessionId,
    runningSessionIds,
    selectedSessionId,
  ]);

  const clearChatState = useCallback(() => {
    if (isRunning) return;
    setHistory([]);
    resetLiveState();
    setError(null);
    setRunSessionId(null);
    runSessionIdRef.current = null;
    resetRunSignals();
  }, [
    isRunning,
    resetLiveState,
    resetRunSignals,
    runSessionIdRef,
    setError,
    setHistory,
    setRunSessionId,
  ]);

  const mergedEntries = useAgentMergedEntries({
    history,
    liveEntries,
    runSessionId,
    selectedSessionId,
  });

  return {
    history,
    liveEntries,
    liveLines,
    liveTick,
    outputText,
    mergedEntries,
    isRunning,
    runSessionId,
    error,
    view,
    queuedPrompts,
    runningSessions,
    runningSessionIds,
    handleViewChange,
    handleSendPrompt,
    handleAskUserAnswer,
    startRun,
    continueRun,
    resumeRun,
    cancelRun,
    handleRemoveQueuedPrompt,
    loadSessionHistory,
    refreshRunningSessions,
    switchSession,
    clearChatState,
  };
};
