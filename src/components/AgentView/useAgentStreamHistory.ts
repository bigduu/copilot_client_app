import { useCallback, useState } from "react";

import { claudeCodeService } from "../../services/ClaudeCodeService";
import type { ClaudeStreamMessage } from "../ClaudeStream";
import { getErrorMessage } from "./agentViewUtils";

type UseAgentStreamHistoryArgs = {
  selectedProjectId: string | null;
  selectedSessionId: string | null;
  debugLog: (...args: any[]) => void;
  setError: (value: string | null) => void;
};

export const useAgentStreamHistory = ({
  selectedProjectId,
  selectedSessionId,
  debugLog,
  setError,
}: UseAgentStreamHistoryArgs) => {
  const [history, setHistory] = useState<ClaudeStreamMessage[]>([]);

  const loadSessionHistory = useCallback(async (): Promise<number> => {
    if (!selectedProjectId || !selectedSessionId) {
      return 0;
    }

    setError(null);
    try {
      const entries = await claudeCodeService.loadSessionHistory(
        selectedProjectId,
        selectedSessionId,
      );
      debugLog("loadSessionHistory(ok)", {
        projectId: selectedProjectId,
        sessionId: selectedSessionId,
        count: entries.length,
        types: entries
          .slice(0, 6)
          .map((e: any) => e?.type)
          .filter(Boolean),
      });
      setHistory(entries as ClaudeStreamMessage[]);
      return entries.length;
    } catch (e) {
      const message = getErrorMessage(e, "Failed to load session history");
      setError(message || "Failed to load session history");
      return 0;
    }
  }, [debugLog, selectedProjectId, selectedSessionId, setError]);

  const loadSessionHistoryFor = useCallback(
    async (projectId: string, sessionId: string): Promise<number> => {
      if (!projectId || !sessionId) return 0;
      setError(null);
      try {
        const entries = await claudeCodeService.loadSessionHistory(
          projectId,
          sessionId,
        );
        setHistory(entries as ClaudeStreamMessage[]);
        return entries.length;
      } catch (e) {
        const message = getErrorMessage(e, "Failed to load session history");
        setError(message || "Failed to load session history");
        return 0;
      }
    },
    [setError],
  );

  return {
    history,
    setHistory,
    loadSessionHistory,
    loadSessionHistoryFor,
  };
};
