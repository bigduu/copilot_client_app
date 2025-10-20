import { create } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";
import { debounce } from "lodash-es";
import { ChatSlice, createChatSlice } from "./slices/chatSessionSlice";
import { ModelSlice, createModelSlice } from "./slices/modelSlice";
import { PromptSlice, createPromptSlice } from "./slices/promptSlice";
import { FavoritesSlice, createFavoritesSlice } from "./slices/favoritesSlice";
import { SessionSlice, createSessionSlice } from "./slices/appSettingsSlice";
import { StorageService } from "../services/StorageService";

export type AppState = ChatSlice &
  ModelSlice &
  PromptSlice &
  FavoritesSlice &
  SessionSlice;

const storageService = new StorageService();

export const useAppStore = create<AppState>()(
  devtools(
    subscribeWithSelector((...a) => ({
      ...createChatSlice(storageService)(...a),
      ...createModelSlice(...a),
      ...createPromptSlice(...a),
      ...createFavoritesSlice(...a),
      ...createSessionSlice(...a),
    })),
    { name: "AppStore" }
  )
);

// Debounced save function
const debouncedSave = debounce(
  (state: Pick<AppState, "chats" | "latestActiveChatId">) => {
    const { chats, latestActiveChatId } = state;
    // The `messages` parameter is deprecated.
    storageService.saveAllData(chats);
    storageService.saveLatestActiveChatId(latestActiveChatId);
  },
  1000
);

// Subscribe to state changes for automatic saving
useAppStore.subscribe(
  (state) => ({
    chats: state.chats,
    latestActiveChatId: state.latestActiveChatId,
  }),
  (state) => {
    debouncedSave(state);
  },
  {
    equalityFn: (a, b) =>
      a.chats === b.chats && a.latestActiveChatId === b.latestActiveChatId,
  }
);

// Initialize the store
const initializeStore = async () => {
  await useAppStore.getState().fetchModels();
  await useAppStore.getState().loadChats();
  await useAppStore.getState().loadSystemPrompts();
  await useAppStore.getState().loadFavorites();
};

initializeStore();
