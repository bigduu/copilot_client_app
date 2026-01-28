import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ClaudeModel =
  | "claude-3-5-sonnet"
  | "claude-3-5-haiku"
  | "claude-3-opus"
  | string;

interface AgentState {
  selectedProjectId: string | null;
  selectedProjectPath: string | null;
  selectedSessionId: string | null;
  model: ClaudeModel;
  thinkingMode: string;
  promptDraft: string;
  sessionsRefreshNonce: number;

  setSelectedProject: (id: string | null, path: string | null) => void;
  setSelectedProjectId: (id: string | null) => void;
  setSelectedProjectPath: (path: string | null) => void;
  setSelectedSessionId: (id: string | null) => void;
  setModel: (model: ClaudeModel) => void;
  setThinkingMode: (value: string) => void;
  setPromptDraft: (value: string) => void;
  bumpSessionsRefreshNonce: () => void;
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set) => ({
      selectedProjectId: null,
      selectedProjectPath: null,
      selectedSessionId: null,
      model: "sonnet",
      thinkingMode: "auto",
      promptDraft: "",
      sessionsRefreshNonce: 0,

      setSelectedProject: (id, path) =>
        set((state) => ({
          selectedProjectId: id,
          selectedProjectPath: path,
          selectedSessionId:
            state.selectedProjectId === id ? state.selectedSessionId : null,
        })),
      setSelectedProjectId: (id) =>
        set((state) => ({
          selectedProjectId: id,
          selectedProjectPath:
            state.selectedProjectId === id ? state.selectedProjectPath : null,
          selectedSessionId:
            state.selectedProjectId === id ? state.selectedSessionId : null,
        })),
      setSelectedProjectPath: (path) => set({ selectedProjectPath: path }),
      setSelectedSessionId: (id) => set({ selectedSessionId: id }),
      setModel: (model) => set({ model }),
      setThinkingMode: (value) => set({ thinkingMode: value }),
      setPromptDraft: (value) => set({ promptDraft: value }),
      bumpSessionsRefreshNonce: () =>
        set((prev) => ({
          sessionsRefreshNonce: prev.sessionsRefreshNonce + 1,
        })),
    }),
    { name: "bodhi_agent_state" },
  ),
);
