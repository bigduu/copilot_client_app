import { useEffect } from "react";
import type { MutableRefObject } from "react";

import { claudeCodeService } from "../../services/ClaudeCodeService";
import { AgentSessionPersistenceService } from "../../services/AgentSessionPersistenceService";
import { deriveProjectId, extractSessionId } from "./agentViewUtils";

type UseAgentStreamReconnectArgs = {
  appendOutputLine: (line: string) => void;
  attachScopedListeners: (sessionId: string) => Promise<void>;
  cleanupListeners: () => void;
  debugLog: (...args: any[]) => void;
  loadSessionHistoryFor: (
    projectId: string,
    sessionId: string,
  ) => Promise<number>;
  resetLiveState: () => void;
  runSessionIdRef: MutableRefObject<string | null>;
  selectedProjectId: string | null;
  selectedSessionId: string | null;
  setRunningSessions: (sessions: any[]) => void;
  setIsRunning: (value: boolean) => void;
  setRunSessionId: (value: string | null) => void;
  setSelectedProject: (id: string | null, path: string | null) => void;
  setSelectedSessionId: (id: string | null) => void;
};

export const useAgentStreamReconnect = ({
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
}: UseAgentStreamReconnectArgs) => {
  useEffect(() => {
    AgentSessionPersistenceService.cleanupOldSessions();
    let active = true;
    const reconnect = async () => {
      try {
        const running = await claudeCodeService.listRunningSessions();
        if (!active) return;
        setRunningSessions(running ?? []);
        if (selectedSessionId || !running?.length) return;
        const sorted = [...running].sort((a, b) => {
          const aTime = new Date(a.started_at ?? a.startedAt ?? 0).getTime();
          const bTime = new Date(b.started_at ?? b.startedAt ?? 0).getTime();
          return bTime - aTime;
        });
        const info = sorted[0];
        const sessionId = extractSessionId(info);
        if (!sessionId) return;
        const projectPath = info.project_path ?? info.projectPath ?? "";
        const projectId = selectedProjectId || deriveProjectId(projectPath);

        setSelectedProject(projectId || null, projectPath || null);
        setSelectedSessionId(sessionId);
        setRunSessionId(sessionId);
        runSessionIdRef.current = sessionId;
        setIsRunning(true);
        resetLiveState();
        cleanupListeners();
        await attachScopedListeners(sessionId);

        const output = await claudeCodeService.getSessionOutput(sessionId);
        if (output) {
          output
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .forEach((line) => appendOutputLine(line));
        }

        const historyCount = await loadSessionHistoryFor(projectId, sessionId);
        AgentSessionPersistenceService.saveSession(
          sessionId,
          projectId,
          projectPath,
          historyCount,
        );
      } catch (e) {
        if (!active) return;
        debugLog("reconnect failed", e);
      }
    };
    void reconnect();
    return () => {
      active = false;
    };
  }, [
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
  ]);
};
