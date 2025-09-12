import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { ChatSlice, createChatSlice } from './slices/chatSlice';
import { ModelSlice, createModelSlice } from './slices/modelSlice';
import { PromptSlice, createPromptSlice } from './slices/promptSlice';
import { FavoritesSlice, createFavoritesSlice } from './slices/favoritesSlice';
import { SessionSlice, createSessionSlice } from './slices/sessionSlice';

export type AppState = ChatSlice & ModelSlice & PromptSlice & FavoritesSlice & SessionSlice;

export const useAppStore = create<AppState>()(
  devtools(
    (...a) => ({
      ...createChatSlice(...a),
      ...createModelSlice(...a),
      ...createPromptSlice(...a),
      ...createFavoritesSlice(...a),
      ...createSessionSlice(...a),
    }),
    { name: 'AppStore' }
  )
);

// Initialize the store
const initializeStore = async () => {
  await useAppStore.getState().fetchModels();
  await useAppStore.getState().loadChats();
  await useAppStore.getState().loadSystemPromptPresets();
  await useAppStore.getState().loadFavorites();
};

initializeStore();