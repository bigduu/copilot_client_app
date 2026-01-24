import { create } from "zustand";
import { persist } from "zustand/middleware";

export type UiMode = "chat" | "agent";

interface UiModeState {
  mode: UiMode;
  setMode: (mode: UiMode) => void;
}

export const useUiModeStore = create<UiModeState>()(
  persist(
    (set) => ({
      mode: "chat",
      setMode: (mode) => set({ mode }),
    }),
    { name: "bodhi_ui_mode" },
  ),
);
