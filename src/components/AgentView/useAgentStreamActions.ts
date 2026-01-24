import { useCallback, useEffect, useState } from "react";
import type { MutableRefObject } from "react";

import { claudeCodeService } from "../../services/ClaudeCodeService";
import { getErrorMessage } from "./agentViewUtils";
import { useAgentRunCommands } from "./useAgentRunCommands";

type ProjectPathStatus = {
  valid: boolean | null;
  message?: string;
};

type SendPromptOverride = {
  prompt?: string;
  model?: string;
  sessionId?: string;
  forceImmediate?: boolean;
};

type UseAgentStreamActionsArgs = {
  attachGenericListeners: () => Promise<void>;
  cleanupListeners: () => void;
  clearPromptDraft: () => void;
  debugLog: (...args: any[]) => void;
  isRunning: boolean;
  model: string;
  promptDraft: string;
  projectPathStatus: ProjectPathStatus;
  resolvedProjectPath: string | null;
  resetRunSignals: () => void;
  resetLiveState: () => void;
  runSessionId: string | null;
  runSessionIdRef: MutableRefObject<string | null>;
  runNextQueuedPromptRef: MutableRefObject<() => void>;
  scheduleFlush: () => void;
  selectedSessionId: string | null;
  seqRef: MutableRefObject<number>;
  setError: (
    value: string | null | ((prev: string | null) => string | null),
  ) => void;
  setHistory: (value: any[]) => void;
  setIsRunning: (value: boolean) => void;
  setRunSessionId: (value: string | null) => void;
  setSelectedSessionId: (value: string | null) => void;
  upsertLiveEntry: (key: string, entry: any) => void;
};

export const useAgentStreamActions = ({
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
}: UseAgentStreamActionsArgs) => {
  const [queuedPrompts, setQueuedPrompts] = useState<
    { id: string; prompt: string; model: string }[]
  >([]);

  const enqueuePrompt = useCallback((prompt: string, modelName: string) => {
    const item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      prompt,
      model: modelName,
    };
    setQueuedPrompts((prev) => [...prev, item]);
  }, []);

  const { startRun, continueRun, resumeRun, cancelRun } = useAgentRunCommands({
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
  });

  const sendPrompt = useCallback(
    async (override?: SendPromptOverride) => {
      if (projectPathStatus.valid === false) {
        setError(projectPathStatus.message || "Project path not found");
        return;
      }
      const nextPrompt = override?.prompt ?? promptDraft;
      const nextModel = override?.model ?? model;
      const nextSessionId = override?.sessionId ?? selectedSessionId;
      const forceImmediate = Boolean(override?.forceImmediate);

      if (isRunning && !forceImmediate) {
        if (nextPrompt.trim()) {
          enqueuePrompt(nextPrompt, nextModel);
          if (!override) {
            clearPromptDraft();
          }
        }
        return;
      }

      debugLog("sendPrompt", {
        selectedProjectPath: resolvedProjectPath,
        selectedSessionId: nextSessionId,
        model: nextModel,
        prompt: nextPrompt,
      });
      if (!resolvedProjectPath) {
        setError("Select a project first");
        return;
      }
      if (!nextPrompt.trim()) {
        setError("Enter a prompt");
        return;
      }

      setError(null);
      if (!override) {
        clearPromptDraft();
      }
      resetRunSignals();
      resetLiveState();
      upsertLiveEntry(`local:${Date.now()}:${seqRef.current++}`, {
        type: "user",
        sessionId: nextSessionId ?? undefined,
        timestamp: new Date().toISOString(),
        message: { role: "user", content: nextPrompt },
        local_prompt: true,
      } as any);
      scheduleFlush();
      setRunSessionId(null);
      runSessionIdRef.current = null;

      cleanupListeners();
      await attachGenericListeners();

      setIsRunning(true);
      try {
        if (nextSessionId) {
          debugLog("sendPrompt -> resume_claude_code", {
            selectedSessionId: nextSessionId,
          });
          await claudeCodeService.resume({
            projectPath: resolvedProjectPath,
            sessionId: nextSessionId,
            prompt: nextPrompt,
            model: nextModel,
          });
        } else {
          debugLog("sendPrompt -> execute_claude_code (no selectedSessionId)");
          await claudeCodeService.execute({
            projectPath: resolvedProjectPath,
            prompt: nextPrompt,
            model: nextModel,
          });
        }
      } catch (e) {
        setIsRunning(false);
        cleanupListeners();
        const message = getErrorMessage(e, "Failed to send prompt");
        setError(message || "Failed to send prompt");
      }
    },
    [
      attachGenericListeners,
      cleanupListeners,
      clearPromptDraft,
      debugLog,
      enqueuePrompt,
      isRunning,
      model,
      projectPathStatus,
      promptDraft,
      resetRunSignals,
      resetLiveState,
      resolvedProjectPath,
      scheduleFlush,
      selectedSessionId,
      setError,
      setIsRunning,
      setRunSessionId,
      upsertLiveEntry,
      seqRef,
    ],
  );

  const handleSendPrompt = useCallback(() => {
    void sendPrompt();
  }, [sendPrompt]);

  const handleAskUserAnswer = useCallback(
    (payload: { prompt: string; sessionId?: string }) => {
      if (!payload.prompt.trim()) return;
      if (payload.sessionId && payload.sessionId !== selectedSessionId) {
        setSelectedSessionId(payload.sessionId);
      }
      void sendPrompt({
        prompt: payload.prompt,
        sessionId: payload.sessionId,
        forceImmediate: true,
      });
    },
    [selectedSessionId, sendPrompt, setSelectedSessionId],
  );

  const runNextQueuedPrompt = useCallback(() => {
    if (isRunning || !queuedPrompts.length) return;
    const next = queuedPrompts[0];
    setQueuedPrompts((prev) => prev.slice(1));
    void sendPrompt({ prompt: next.prompt, model: next.model });
  }, [isRunning, queuedPrompts, sendPrompt]);

  useEffect(() => {
    runNextQueuedPromptRef.current = runNextQueuedPrompt;
  }, [runNextQueuedPrompt]);

  useEffect(() => {
    if (!isRunning && queuedPrompts.length) {
      runNextQueuedPrompt();
    }
  }, [isRunning, queuedPrompts.length, runNextQueuedPrompt]);

  const handleRemoveQueuedPrompt = useCallback((id: string) => {
    setQueuedPrompts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return {
    cancelRun,
    continueRun,
    handleAskUserAnswer,
    handleRemoveQueuedPrompt,
    handleSendPrompt,
    queuedPrompts,
    resumeRun,
    sendPrompt,
    startRun,
  };
};
