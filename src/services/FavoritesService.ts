import { FavoriteItem } from "../types/chat";

const FAVORITES_STORAGE_KEY = "chat_favorites";

/**
 * FavoritesService 处理收藏夹相关的核心业务逻辑
 * 包括收藏夹的增删改查、持久化等
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
   * 从本地存储加载收藏夹数据
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
   * 保存收藏夹数据到本地存储
   */
  saveFavorites(favorites: FavoriteItem[]): void {
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
    } catch (error) {
      console.error("Error saving favorites:", error);
    }
  }

  /**
   * 添加新的收藏项
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
   * 删除收藏项
   */
  removeFavorite(id: string, currentFavorites: FavoriteItem[]): FavoriteItem[] {
    return currentFavorites.filter((fav) => fav.id !== id);
  }

  /**
   * 更新收藏项
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
   * 获取指定聊天的收藏项
   */
  getChatFavorites(chatId: string, favorites: FavoriteItem[]): FavoriteItem[] {
    return favorites.filter((fav) => fav.chatId === chatId);
  }

  /**
   * 生成收藏夹总结内容
   */
  generateSummaryContent(favorites: FavoriteItem[]): string {
    if (favorites.length === 0) return "";

    let summaryContent = "Please summarize the following content:\n\n";

    favorites.forEach((fav, index) => {
      // Add content from favorite
      summaryContent += `### ${fav.role === "user" ? "用户" : "助手"} ${
        index + 1
      }:\n\n`;
      summaryContent += fav.content;
      summaryContent += "\n\n";

      // Add note if it exists
      if (fav.note) {
        summaryContent += `> 笔记: ${fav.note}\n\n`;
      }
    });

    // Add specific summary request
    summaryContent +=
      "请根据以上内容提供一个全面的总结，包括主要观点和重要信息。";

    return summaryContent;
  }

  /**
   * 检查收藏项是否存在
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
   * 按创建时间排序收藏项
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
   * 搜索收藏项
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
   * 获取收藏项统计信息
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
