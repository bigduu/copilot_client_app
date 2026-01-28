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
  thinkingMode: string;
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
}: UseAgentStreamActionsArgs) => {
  const [queuedPromptsBySession, setQueuedPromptsBySession] = useState<
    Record<string, { id: string; prompt: string; model: string }[]>
  >({});

  const getSessionKey = useCallback(
    (sessionId?: string | null) => sessionId ?? "new",
    [],
  );

  const activeSessionKey = getSessionKey(selectedSessionId);
  const queuedPrompts = queuedPromptsBySession[activeSessionKey] ?? [];

  const enqueuePrompt = useCallback(
    (prompt: string, modelName: string, sessionKey: string) => {
      const item = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        prompt,
        model: modelName,
      };
      setQueuedPromptsBySession((prev) => ({
        ...prev,
        [sessionKey]: [...(prev[sessionKey] ?? []), item],
      }));
    },
    [],
  );

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
      const queueKey = getSessionKey(nextSessionId);
      const forceImmediate = Boolean(override?.forceImmediate);
      const trimmedPrompt = nextPrompt.trim();
      let finalPrompt = trimmedPrompt;
      if (trimmedPrompt && thinkingMode !== "auto") {
        const phraseMap: Record<string, string> = {
          think: "think",
          think_hard: "think hard",
          think_harder: "think harder",
          ultrathink: "ultrathink",
        };
        const phrase = phraseMap[thinkingMode];
        if (phrase) {
          finalPrompt = `${trimmedPrompt}.\n\n${phrase}.`;
        }
      }

      if (isRunning && !forceImmediate) {
        if (finalPrompt.trim()) {
          enqueuePrompt(finalPrompt, nextModel, queueKey);
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
        prompt: finalPrompt,
      });
      if (!resolvedProjectPath) {
        setError("Select a project first");
        return;
      }
      if (!finalPrompt.trim()) {
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
        message: { role: "user", content: finalPrompt },
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
            prompt: finalPrompt,
            model: nextModel,
          });
        } else {
          debugLog("sendPrompt -> execute_claude_code (no selectedSessionId)");
          await claudeCodeService.execute({
            projectPath: resolvedProjectPath,
            prompt: finalPrompt,
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
      getSessionKey,
      isRunning,
      model,
      thinkingMode,
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
    setQueuedPromptsBySession((prev) => ({
      ...prev,
      [activeSessionKey]: prev[activeSessionKey]?.slice(1) ?? [],
    }));
    void sendPrompt({ prompt: next.prompt, model: next.model });
  }, [activeSessionKey, isRunning, queuedPrompts, sendPrompt]);

  useEffect(() => {
    runNextQueuedPromptRef.current = runNextQueuedPrompt;
  }, [runNextQueuedPrompt]);

  useEffect(() => {
    if (!isRunning && queuedPrompts.length) {
      runNextQueuedPrompt();
    }
  }, [isRunning, queuedPrompts.length, runNextQueuedPrompt]);

  const handleRemoveQueuedPrompt = useCallback(
    (id: string) => {
      setQueuedPromptsBySession((prev) => ({
        ...prev,
        [activeSessionKey]: (prev[activeSessionKey] ?? []).filter(
          (p) => p.id !== id,
        ),
      }));
    },
    [activeSessionKey],
  );

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
