import { FavoriteItem } from "../types/chat";

const FAVORITES_STORAGE_KEY = "chat_favorites";

/**
 * FavoritesService handles core business logic for favorites functionality
 * Including CRUD operations and persistence for favorites
 */
export class FavoritesService {
  private static instance: FavoritesService;

  static getInstance(): FavoritesService {
    if (!FavoritesService.instance) {
      FavoritesService.instance = new FavoritesService();
    }
    return FavoritesService.instance;
  }

  /**
   * Load favorites data from local storage
   */
  loadFavorites(): FavoriteItem[] {
    try {
      const storedFavorites = localStorage.getItem(FAVORITES_STORAGE_KEY);
      return storedFavorites ? JSON.parse(storedFavorites) : [];
    } catch (error) {
      console.error("Error loading favorites:", error);
      return [];
    }
  }

  /**
   * Save favorites data to local storage
   */
  saveFavorites(favorites: FavoriteItem[]): void {
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
    } catch (error) {
      console.error("Error saving favorites:", error);
    }
  }

  /**
   * Add a new favorite item
   */
  addFavorite(
    favorite: Omit<FavoriteItem, "id" | "createdAt">,
    currentFavorites: FavoriteItem[]
  ): { newFavorites: FavoriteItem[]; newFavoriteId: string } {
    const id = crypto.randomUUID();
    // Generate a messageId if not provided
    const messageId = favorite.messageId || crypto.randomUUID();

    const newFavorite: FavoriteItem = {
      ...favorite,
      id,
      messageId,
      createdAt: Date.now(),
    };

    const newFavorites = [...currentFavorites, newFavorite];
    return { newFavorites, newFavoriteId: id };
  }

  /**
   * Remove a favorite item
   */
  removeFavorite(id: string, currentFavorites: FavoriteItem[]): FavoriteItem[] {
    return currentFavorites.filter((fav) => fav.id !== id);
  }

  /**
   * Update a favorite item
   */
  updateFavorite(
    id: string,
    updates: Partial<Omit<FavoriteItem, "id" | "createdAt">>,
    currentFavorites: FavoriteItem[]
  ): FavoriteItem[] {
    return currentFavorites.map((fav) =>
      fav.id === id ? { ...fav, ...updates } : fav
    );
  }

  /**
   * Get favorite items for a specific chat
   */
  getChatFavorites(chatId: string, favorites: FavoriteItem[]): FavoriteItem[] {
    return favorites.filter((fav) => fav.chatId === chatId);
  }

  /**
   * Generate summary content for favorites
   */
  generateSummaryContent(favorites: FavoriteItem[]): string {
    if (favorites.length === 0) return "";

    let summaryContent = "Please summarize the following content:\n\n";

    favorites.forEach((fav, index) => {
      // Add content from favorite
      summaryContent += `### ${fav.role === "user" ? "User" : "Assistant"} ${
        index + 1
      }:\n\n`;
      summaryContent += fav.content;
      summaryContent += "\n\n";

      // Add note if it exists
      if (fav.note) {
        summaryContent += `> Note: ${fav.note}\n\n`;
      }
    });

    // Add specific summary request
    summaryContent +=
      "Please provide a comprehensive summary based on the above content, including key points and important information.";

    return summaryContent;
  }

  /**
   * Check if a favorite item exists
   */
  favoriteExists(
    chatId: string,
    messageId: string,
    favorites: FavoriteItem[]
  ): boolean {
    return favorites.some(
      (fav) => fav.chatId === chatId && fav.messageId === messageId
    );
  }

  /**
   * Sort favorite items by creation time
   */
  sortFavoritesByDate(
    favorites: FavoriteItem[],
    order: "asc" | "desc" = "desc"
  ): FavoriteItem[] {
    return [...favorites].sort((a, b) => {
      return order === "desc" ? b.createdAt - a.createdAt : a.createdAt - b.createdAt;
    });
  }

  /**
   * Search favorite items
   */
  searchFavorites(query: string, favorites: FavoriteItem[]): FavoriteItem[] {
    if (!query.trim()) return favorites;

    const lowercaseQuery = query.toLowerCase();
    return favorites.filter(
      (fav) =>
        fav.content.toLowerCase().includes(lowercaseQuery) ||
        fav.note?.toLowerCase().includes(lowercaseQuery)
    );
  }

  /**
   * Get statistics for favorite items
   */
  getFavoritesStats(favorites: FavoriteItem[]): {
    total: number;
    byRole: { user: number; assistant: number };
    withNotes: number;
  } {
    const stats = {
      total: favorites.length,
      byRole: { user: 0, assistant: 0 },
      withNotes: 0,
    };

    favorites.forEach((fav) => {
      if (fav.role === "user") stats.byRole.user++;
      else if (fav.role === "assistant") stats.byRole.assistant++;
      if (fav.note) stats.withNotes++;
    });

    return stats;
  }
}
