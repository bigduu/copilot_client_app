import { useCallback, useEffect, useRef, useState } from "react";

import type { ClaudeStreamMessage } from "../ClaudeStream";
import { useAgentMergedEntries } from "./useAgentMergedEntries";
import { useAgentStreamActions } from "./useAgentStreamActions";
import { useAgentStreamBuffers } from "./useAgentStreamBuffers";
import { useAgentStreamHistory } from "./useAgentStreamHistory";
import { useAgentStreamListeners } from "./useAgentStreamListeners";
import { useAgentStreamReconnect } from "./useAgentStreamReconnect";

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
  promptDraft: string;
  setPromptDraft: (value: string) => void;
  setSelectedProject: (id: string | null, path: string | null) => void;
  setSelectedSessionId: (id: string | null) => void;
  bumpSessionsRefreshNonce: () => void;
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
  clearChatState: () => void;
};

export const useAgentStreamState = ({
  selectedProjectId,
  selectedSessionId,
  resolvedProjectPath,
  projectPathStatus,
  model,
  promptDraft,
  setPromptDraft,
  setSelectedProject,
  setSelectedSessionId,
  bumpSessionsRefreshNonce,
}: UseAgentStreamStateArgs): UseAgentStreamStateResult => {
  const debugLog = useCallback((...args: any[]) => {
    if (!import.meta.env.DEV) return;
    console.log("[AgentView]", ...args);
  }, []);

  const [isRunning, setIsRunning] = useState(false);
  const [runSessionId, setRunSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runNextQueuedPromptRef = useRef<() => void>(() => {});

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
      resolvedProjectPath,
      runNextQueuedPromptRef,
      runSessionIdRef,
      sawAssistantRef,
      selectedProjectId,
      selectedSessionId,
      setError,
      setIsRunning,
      setRunSessionId,
      setSelectedProject,
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
    setIsRunning,
    setRunSessionId,
    setSelectedProject,
    setSelectedSessionId,
  });

  const clearPromptDraft = useCallback(() => {
    setPromptDraft("");
  }, [setPromptDraft]);

  const {
    cancelRun,
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
    handleViewChange,
    handleSendPrompt,
    handleAskUserAnswer,
    startRun,
    continueRun,
    resumeRun,
    cancelRun,
    handleRemoveQueuedPrompt,
    loadSessionHistory,
    clearChatState,
  };
};
