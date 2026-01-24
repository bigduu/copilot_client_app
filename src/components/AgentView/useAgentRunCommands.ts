import { useCallback } from "react";

import { claudeCodeService } from "../../services/ClaudeCodeService";
import { getErrorMessage } from "./agentViewUtils";
import type { UseAgentRunCommandsArgs } from "./agentRunCommandTypes";

export const useAgentRunCommands = ({
  attachGenericListeners,
  cleanupListeners,
  clearPromptDraft,
  debugLog,
  model,
  promptDraft,
  projectPathStatus,
  resolvedProjectPath,
  resetRunSignals,
  resetLiveState,
  runSessionId,
  runSessionIdRef,
  scheduleFlush,
  selectedSessionId,
  seqRef,
  setError,
  setHistory,
  setIsRunning,
  setRunSessionId,
  setSelectedSessionId,
  upsertLiveEntry,
}: UseAgentRunCommandsArgs) => {
  const startRun = useCallback(async () => {
    if (projectPathStatus.valid === false) {
      setError(projectPathStatus.message || "Project path not found");
      return;
    }
    debugLog("startRun(New Session)", {
      selectedProjectPath: resolvedProjectPath,
      selectedSessionId,
      model,
      prompt: promptDraft,
    });
    if (!resolvedProjectPath) {
      setError("Select a project first");
      return;
    }
    if (!promptDraft.trim()) {
      setError("Enter a prompt");
      return;
    }

    setError(null);
    clearPromptDraft();
    resetRunSignals();
    setHistory([]);
    resetLiveState();
    upsertLiveEntry(`local:${Date.now()}:${seqRef.current++}`, {
      type: "user",
      timestamp: new Date().toISOString(),
      message: { role: "user", content: promptDraft },
      local_prompt: true,
    } as any);
    scheduleFlush();
    setRunSessionId(null);
    runSessionIdRef.current = null;
    setSelectedSessionId(null);

    cleanupListeners();
    await attachGenericListeners();

    setIsRunning(true);
    try {
      await claudeCodeService.execute({
        projectPath: resolvedProjectPath,
        prompt: promptDraft,
        model,
      });
    } catch (e) {
      setIsRunning(false);
      cleanupListeners();
      const message = getErrorMessage(e, "Failed to start Claude run");
      setError(message || "Failed to start Claude run");
    }
  }, [
    attachGenericListeners,
    cleanupListeners,
    clearPromptDraft,
    debugLog,
    model,
    projectPathStatus,
    promptDraft,
    resetRunSignals,
    resetLiveState,
    resolvedProjectPath,
    scheduleFlush,
    selectedSessionId,
    seqRef,
    setError,
    setHistory,
    setIsRunning,
    setRunSessionId,
    setSelectedSessionId,
    upsertLiveEntry,
  ]);

  const continueRun = useCallback(async () => {
    if (projectPathStatus.valid === false) {
      setError(projectPathStatus.message || "Project path not found");
      return;
    }
    debugLog("continueRun(most recent)", {
      selectedProjectPath: resolvedProjectPath,
      selectedSessionId,
      model,
      prompt: promptDraft,
    });
    if (!resolvedProjectPath) {
      setError("Select a project first");
      return;
    }
    if (!promptDraft.trim()) {
      setError("Enter a prompt");
      return;
    }

    setError(null);
    clearPromptDraft();
    resetRunSignals();
    resetLiveState();
    upsertLiveEntry(`local:${Date.now()}:${seqRef.current++}`, {
      type: "user",
      timestamp: new Date().toISOString(),
      message: { role: "user", content: promptDraft },
      local_prompt: true,
    } as any);
    scheduleFlush();
    setRunSessionId(null);
    runSessionIdRef.current = null;

    cleanupListeners();
    await attachGenericListeners();

    setIsRunning(true);
    try {
      await claudeCodeService.continue({
        projectPath: resolvedProjectPath,
        prompt: promptDraft,
        model,
      });
    } catch (e) {
      setIsRunning(false);
      cleanupListeners();
      const message = getErrorMessage(e, "Failed to start Claude run");
      setError(message || "Failed to start Claude run");
    }
  }, [
    attachGenericListeners,
    cleanupListeners,
    clearPromptDraft,
    debugLog,
    model,
    projectPathStatus,
    promptDraft,
    resetRunSignals,
    resetLiveState,
    resolvedProjectPath,
    scheduleFlush,
    selectedSessionId,
    seqRef,
    setError,
    setIsRunning,
    setRunSessionId,
    upsertLiveEntry,
  ]);

  const resumeRun = useCallback(async () => {
    if (projectPathStatus.valid === false) {
      setError(projectPathStatus.message || "Project path not found");
      return;
    }
    debugLog("resumeRun(explicit)", {
      selectedProjectPath: resolvedProjectPath,
      selectedSessionId,
      model,
      prompt: promptDraft,
    });
    if (!resolvedProjectPath) {
      setError("Select a project first");
      return;
    }
    if (!selectedSessionId) {
      setError("Select a session to resume");
      return;
    }
    if (!promptDraft.trim()) {
      setError("Enter a prompt");
      return;
    }

    setError(null);
    clearPromptDraft();
    resetRunSignals();
    resetLiveState();
    upsertLiveEntry(`local:${Date.now()}:${seqRef.current++}`, {
      type: "user",
      sessionId: selectedSessionId ?? undefined,
      timestamp: new Date().toISOString(),
      message: { role: "user", content: promptDraft },
      local_prompt: true,
    } as any);
    scheduleFlush();
    setRunSessionId(null);
    runSessionIdRef.current = null;

    cleanupListeners();
    await attachGenericListeners();

    setIsRunning(true);
    try {
      await claudeCodeService.resume({
        projectPath: resolvedProjectPath,
        sessionId: selectedSessionId,
        prompt: promptDraft,
        model,
      });
    } catch (e) {
      setIsRunning(false);
      cleanupListeners();
      const message = getErrorMessage(e, "Failed to resume Claude run");
      setError(message || "Failed to resume Claude run");
    }
  }, [
    attachGenericListeners,
    cleanupListeners,
    clearPromptDraft,
    debugLog,
    model,
    projectPathStatus,
    promptDraft,
    resetRunSignals,
    resetLiveState,
    resolvedProjectPath,
    scheduleFlush,
    selectedSessionId,
    seqRef,
    setError,
    setIsRunning,
    setRunSessionId,
    upsertLiveEntry,
  ]);

  const cancelRun = useCallback(async () => {
    debugLog("cancelRun");
    try {
      await claudeCodeService.cancel(
        runSessionId ?? selectedSessionId ?? undefined,
      );
    } catch (e) {
      setError(getErrorMessage(e, "Failed to cancel"));
    } finally {
      setIsRunning(false);
      cleanupListeners();
    }
  }, [
    cleanupListeners,
    debugLog,
    runSessionId,
    selectedSessionId,
    setError,
    setIsRunning,
  ]);

  return {
    cancelRun,
    continueRun,
    resumeRun,
    startRun,
  };
};
