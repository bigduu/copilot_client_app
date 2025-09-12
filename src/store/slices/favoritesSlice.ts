import { StateCreator } from 'zustand';
import { FavoriteItem } from '../../types/chat';
import type { AppState } from '../';

// Simple in-memory/localStorage service for favorites
const favoritesStorageService = {
  async loadFavorites(): Promise<FavoriteItem[]> {
    try {
      const stored = localStorage.getItem('copilot_favorites');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to load favorites:', error);
      return [];
    }
  },

  async saveFavorites(favorites: FavoriteItem[]): Promise<void> {
    try {
      localStorage.setItem('copilot_favorites', JSON.stringify(favorites));
    } catch (error) {
      console.error('Failed to save favorites:', error);
    }
  },
};

export interface FavoritesSlice {
  // State
  favorites: FavoriteItem[];

  // Actions
  addFavorite: (favorite: Omit<FavoriteItem, 'id' | 'createdAt'>) => string;
  removeFavorite: (favoriteId: string) => void;
  updateFavorite: (favoriteId: string, updates: Partial<Omit<FavoriteItem, 'id' | 'createdAt'>>) => void;
  loadFavorites: () => Promise<void>;
  saveFavorites: () => Promise<void>;
}

export const createFavoritesSlice: StateCreator<AppState, [], [], FavoritesSlice> = (set, get) => ({
  // Initial state
  favorites: [],

  // Favorites management
  addFavorite: (favorite) => {
    const id = crypto.randomUUID();
    const newFavorite: FavoriteItem = {
      ...favorite,
      id,
      createdAt: Date.now(),
    };

    set(state => ({ ...state, favorites: [...state.favorites, newFavorite] }));
    get().saveFavorites();
    return id;
  },

  removeFavorite: (favoriteId) => {
    set(state => ({ ...state, favorites: state.favorites.filter(fav => fav.id !== favoriteId) }));
    get().saveFavorites();
  },

  updateFavorite: (favoriteId, updates) => {
    set(state => ({
      ...state,
      favorites: state.favorites.map(fav =>
        fav.id === favoriteId ? { ...fav, ...updates } : fav
      )
    }));
    get().saveFavorites();
  },

  loadFavorites: async () => {
    const favorites = await favoritesStorageService.loadFavorites();
    set(state => ({ ...state, favorites }));
  },

  saveFavorites: async () => {
    await favoritesStorageService.saveFavorites(get().favorites);
  },
});