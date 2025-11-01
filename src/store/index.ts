import { create } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";
import { ChatSlice, createChatSlice } from "./slices/chatSessionSlice";
import { ModelSlice, createModelSlice } from "./slices/modelSlice";
import { PromptSlice, createPromptSlice } from "./slices/promptSlice";
import { FavoritesSlice, createFavoritesSlice } from "./slices/favoritesSlice";
import { SessionSlice, createSessionSlice } from "./slices/appSettingsSlice";

export type AppState = ChatSlice &
  ModelSlice &
  PromptSlice &
  FavoritesSlice &
  SessionSlice;

export const useAppStore = create<AppState>()(
  devtools(
    subscribeWithSelector((...a) => ({
      ...createChatSlice(...a),
      ...createModelSlice(...a),
      ...createPromptSlice(...a),
      ...createFavoritesSlice(...a),
      ...createSessionSlice(...a),
    })),
    { name: "AppStore" }
  )
);

// Initialize the store
const initializeStore = async () => {
  await useAppStore.getState().fetchModels();
  await useAppStore.getState().loadChats();
  await useAppStore.getState().loadSystemPrompts();
  await useAppStore.getState().loadFavorites();
};

initializeStore();
