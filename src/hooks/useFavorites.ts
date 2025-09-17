import { useCallback } from 'react';
import { useAppStore } from '../store';
import { FavoriteItem } from '../types/chat';

/**
 * Hook for managing favorites, backed by Zustand store.
 * This replaces the need for a separate FavoritesService.
 */
export const useFavorites = () => {
  // Select state and actions from the Zustand store
  const favorites = useAppStore(state => state.favorites);
  const loadFavorites = useAppStore(state => state.loadFavorites);
  const addFavorite = useAppStore(state => state.addFavorite);
  const removeFavorite = useAppStore(state => state.removeFavorite);
  const updateFavorite = useAppStore(state => state.updateFavorite);

  const getChatFavorites = useCallback((chatId: string) => {
    return favorites.filter(fav => fav.chatId === chatId);
  }, [favorites]);

  const favoriteExists = useCallback((chatId: string, messageId: string) => {
    return favorites.some(fav => fav.chatId === chatId && fav.messageId === messageId);
  }, [favorites]);

  const searchFavorites = useCallback((query: string) => {
    if (!query.trim()) return favorites;
    const lowercaseQuery = query.toLowerCase();
    return favorites.filter(
      (fav) =>
        fav.content.toLowerCase().includes(lowercaseQuery) ||
        fav.note?.toLowerCase().includes(lowercaseQuery)
    );
  }, [favorites]);

  const getFavoritesStats = useCallback(() => {
    const stats = {
      total: favorites.length,
      byRole: { user: 0, assistant: 0 },
      withNotes: 0,
    };
    favorites.forEach((fav) => {
      if (fav.role === 'user') stats.byRole.user++;
      else if (fav.role === 'assistant') stats.byRole.assistant++;
      if (fav.note) stats.withNotes++;
    });
    return stats;
  }, [favorites]);

  return {
    favorites,
    loadFavorites,
    addFavorite,
    removeFavorite,
    updateFavorite,
    getChatFavorites,
    favoriteExists,
    searchFavorites,
    getFavoritesStats,
  };
};
