import type { MutableRefObject } from "react";

export type ProjectPathStatus = {
  valid: boolean | null;
  message?: string;
};

export type UseAgentRunCommandsArgs = {
  attachGenericListeners: () => Promise<void>;
  cleanupListeners: () => void;
  clearPromptDraft: () => void;
  debugLog: (...args: any[]) => void;
  model: string;
  promptDraft: string;
  projectPathStatus: ProjectPathStatus;
  resolvedProjectPath: string | null;
  resetRunSignals: () => void;
  resetLiveState: () => void;
  runSessionId: string | null;
  runSessionIdRef: MutableRefObject<string | null>;
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
