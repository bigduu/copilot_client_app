import { create } from "zustand"
import { persist } from "zustand/middleware"

export type ClaudeModel =
  | "claude-3-5-sonnet"
  | "claude-3-5-haiku"
  | "claude-3-opus"
  | string

interface AgentState {
  selectedProjectId: string | null
  selectedSessionId: string | null
  model: ClaudeModel
  skipPermissions: boolean
  promptDraft: string
  sessionsRefreshNonce: number

  setSelectedProjectId: (id: string | null) => void
  setSelectedSessionId: (id: string | null) => void
  setModel: (model: ClaudeModel) => void
  setSkipPermissions: (skip: boolean) => void
  setPromptDraft: (value: string) => void
  bumpSessionsRefreshNonce: () => void
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set) => ({
      selectedProjectId: null,
      selectedSessionId: null,
      model: "sonnet",
      skipPermissions: false,
      promptDraft: "",
      sessionsRefreshNonce: 0,

      setSelectedProjectId: (id) =>
        set({ selectedProjectId: id, selectedSessionId: null }),
      setSelectedSessionId: (id) => set({ selectedSessionId: id }),
      setModel: (model) => set({ model }),
      setSkipPermissions: (skip) => set({ skipPermissions: skip }),
      setPromptDraft: (value) => set({ promptDraft: value }),
      bumpSessionsRefreshNonce: () =>
        set((prev) => ({ sessionsRefreshNonce: prev.sessionsRefreshNonce + 1 })),
    }),
    { name: "bodhi_agent_state" },
  ),
)
