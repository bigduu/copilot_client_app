import { create } from "zustand";

type SettingsOrigin = "chat";

interface SettingsViewState {
  isOpen: boolean;
  origin: SettingsOrigin;
  open: (origin: SettingsOrigin) => void;
  close: () => void;
}

export const useSettingsViewStore = create<SettingsViewState>((set) => ({
  isOpen: false,
  origin: "chat",
  open: (origin) => set({ isOpen: true, origin }),
  close: () => set({ isOpen: false }),
}));
