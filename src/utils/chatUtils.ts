import { ChatItem } from "../types/chat";

export const generateChatTitle = (chatNumber: number): string => {
  const now = new Date();
  const date = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `Chat ${chatNumber} - ${date}`;
};

// Date utility functions for chat grouping
export const isToday = (date: Date): boolean => {
  const today = new Date();
  return date.toDateString() === today.toDateString();
};

export const isYesterday = (date: Date): boolean => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return date.toDateString() === yesterday.toDateString();
};

export const isThisWeek = (date: Date): boolean => {
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  return date >= startOfWeek && date <= endOfWeek;
};

export const isThisMonth = (date: Date): boolean => {
  const today = new Date();
  return date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
};

export const getDateGroupKey = (date: Date): string => {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  if (isThisWeek(date)) return "This Week";
  if (isThisMonth(date)) return "This Month";

  // For older dates, group by month
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });
};

export const getDateGroupWeight = (dateKey: string): number => {
  const weights: Record<string, number> = {
    "Today": 0,
    "Yesterday": 1,
    "This Week": 2,
    "This Month": 3,
  };

  return weights[dateKey] ?? 4; // Older dates get weight 4+
};

export const groupChatsByDate = (
  chats: ChatItem[]
): Record<string, ChatItem[]> => {
  const grouped: Record<string, ChatItem[]> = {};
  // Add pinned group at the top if any pinned chats
  const pinnedChats = chats.filter((chat) => chat.pinned);
  if (pinnedChats.length > 0) {
    grouped["Pinned"] = pinnedChats.sort((a, b) => b.createdAt - a.createdAt);
  }
  // Group the rest by date
  chats
    .filter((chat) => !chat.pinned)
    .forEach((chat) => {
      const date = new Date(chat.createdAt);
      const dateString = date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      if (!grouped[dateString]) {
        grouped[dateString] = [];
      }
      grouped[dateString].push(chat);
    });
  // Sort each group by createdAt in descending order (newest first)
  Object.keys(grouped).forEach((date) => {
    grouped[date].sort((a, b) => b.createdAt - a.createdAt);
  });
  return grouped;
};

/**
 * Group chats by tool category, sort by time within each category
 */
export const groupChatsByToolCategory = (
  chats: ChatItem[]
): Record<string, ChatItem[]> => {
  const grouped: Record<string, ChatItem[]> = {};

  // Handle pinned chats first
  const pinnedChats = chats.filter((chat) => chat.pinned);
  if (pinnedChats.length > 0) {
    grouped["Pinned"] = pinnedChats.sort((a, b) => b.createdAt - a.createdAt);
  }

  // Group non-pinned chats by tool category
  chats
    .filter((chat) => !chat.pinned)
    .forEach((chat) => {
      const category = chat.toolCategory || "General"; // 默认分类为 "General"
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(chat);
    });

  // Sort by time within each category (newest first)
  Object.keys(grouped).forEach((category) => {
    if (category !== "Pinned") {
      grouped[category].sort((a, b) => b.createdAt - a.createdAt);
    }
  });

  return grouped;
};

/**
 * Group chats by date and then by category within each date
 * Returns a nested structure: { dateKey: { category: ChatItem[] } }
 */
export interface DateCategoryGroup {
  [dateKey: string]: {
    [category: string]: ChatItem[];
  };
}

export const groupChatsByDateAndCategory = (
  chats: ChatItem[]
): DateCategoryGroup => {
  const grouped: DateCategoryGroup = {};

  // Handle pinned chats first - they go in a special "Pinned" section
  const pinnedChats = chats.filter((chat) => chat.pinned);
  if (pinnedChats.length > 0) {
    grouped["Pinned"] = {
      "Pinned": pinnedChats.sort((a, b) => b.createdAt - a.createdAt),
    };
  }

  // Group non-pinned chats by date first, then by category
  chats
    .filter((chat) => !chat.pinned)
    .forEach((chat) => {
      const chatDate = new Date(chat.createdAt);
      const dateKey = getDateGroupKey(chatDate);
      const category = chat.toolCategory || "General";

      if (!grouped[dateKey]) {
        grouped[dateKey] = {};
      }
      if (!grouped[dateKey][category]) {
        grouped[dateKey][category] = [];
      }
      grouped[dateKey][category].push(chat);
    });

  // Sort chats within each category by time (newest first)
  Object.keys(grouped).forEach((dateKey) => {
    Object.keys(grouped[dateKey]).forEach((category) => {
      grouped[dateKey][category].sort((a, b) => b.createdAt - a.createdAt);
    });
  });

  return grouped;
};

/**
 * Get sorted date keys for consistent ordering
 */
export const getSortedDateKeys = (grouped: DateCategoryGroup): string[] => {
  return Object.keys(grouped).sort((a, b) => {
    // Pinned always comes first
    if (a === "Pinned") return -1;
    if (b === "Pinned") return 1;

    // Sort by date group weight
    return getDateGroupWeight(a) - getDateGroupWeight(b);
  });
};

/**
 * Get category display information
 */
export interface CategoryDisplayInfo {
  name: string;
  icon: string;
  description: string;
  color?: string;
}

export const getCategoryDisplayInfo = (
  category: string
): CategoryDisplayInfo => {
  // 固定的特殊分组处理
  if (category === "Pinned") {
    return {
      name: "Pinned Chats",
      icon: "📌",
      description: "Important pinned chat records",
      color: "#f5222d",
    };
  }

  // 对于工具类别，必须从后端动态获取配置
  throw new Error(`工具类别 "${category}" 的显示信息必须从后端配置获取，前端不提供硬编码配置`);
};

/**
 * Get category display information (异步版本)
 * 从后端获取类别显示信息
 */
export const getCategoryDisplayInfoAsync = async (
  category: string
): Promise<CategoryDisplayInfo> => {
  // 固定的特殊分组处理
  if (category === "Pinned") {
    return {
      name: "Pinned Chats",
      icon: "📌",
      description: "Important pinned chat records",
      color: "#f5222d",
    };
  }

  // 从ToolService获取类别显示信息
  try {
    const { ToolService } = await import('../services/ToolService');
    const toolService = ToolService.getInstance();
    return await toolService.getCategoryDisplayInfo(category);
  } catch (error) {
    console.error('获取工具类别显示信息失败:', error);
    throw new Error(`工具类别 "${category}" 的显示信息未配置。请检查后端是否已注册该类别。`);
  }
};

/**
 * Get sorting weight for tool categories
 * 同步版本：用于已知有后端配置的情况
 */
export const getCategoryWeight = (category: string): number => {
  // 固定的特殊分组处理
  if (category === "Pinned") {
    return 0;
  }

  // 对于工具类别，排序权重必须从后端配置获取
  throw new Error(`工具类别 "${category}" 的排序权重必须从后端配置获取，前端不提供硬编码配置`);
};

/**
 * Get sorting weight for tool categories (异步版本)
 * 从后端获取类别权重
 */
export const getCategoryWeightAsync = async (category: string): Promise<number> => {
  // 固定的特殊分组处理
  if (category === "Pinned") {
    return 0;
  }

  // 从ToolService获取权重
  try {
    const { ToolService } = await import('../services/ToolService');
    const toolService = ToolService.getInstance();
    return await toolService.getCategoryWeight(category);
  } catch (error) {
    console.error('获取工具类别权重失败:', error);
    throw new Error(`工具类别 "${category}" 的排序权重未配置。请检查后端是否已注册该类别。`);
  }
};

/**
 * Get all chat IDs from a specific date group
 */
export const getChatIdsByDate = (
  grouped: DateCategoryGroup,
  dateKey: string
): string[] => {
  if (!grouped[dateKey]) return [];

  const chatIds: string[] = [];
  Object.values(grouped[dateKey]).forEach((chats) => {
    chats.forEach((chat) => chatIds.push(chat.id));
  });

  return chatIds;
};

/**
 * Get all chat IDs from a specific date and category
 */
export const getChatIdsByDateAndCategory = (
  grouped: DateCategoryGroup,
  dateKey: string,
  category: string
): string[] => {
  if (!grouped[dateKey] || !grouped[dateKey][category]) return [];

  return grouped[dateKey][category].map((chat) => chat.id);
};

/**
 * Get chat count for a date group
 */
export const getChatCountByDate = (
  grouped: DateCategoryGroup,
  dateKey: string
): number => {
  if (!grouped[dateKey]) return 0;

  return Object.values(grouped[dateKey]).reduce(
    (total, chats) => total + chats.length,
    0
  );
};

/**
 * Sort grouped results by weight
 */
export const sortGroupedChatsByWeight = (
  grouped: Record<string, ChatItem[]>
): Record<string, ChatItem[]> => {
  const sortedEntries = Object.entries(grouped).sort(
    ([categoryA], [categoryB]) => {
      return getCategoryWeight(categoryA) - getCategoryWeight(categoryB);
    }
  );

  return Object.fromEntries(sortedEntries);
};
