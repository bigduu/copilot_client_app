import { ChatItem, TOOL_CATEGORIES } from "../types/chat";

export const generateChatTitle = (chatNumber: number): string => {
  const now = new Date();
  const date = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `Chat ${chatNumber} - ${date}`;
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
      const category = chat.toolCategory || TOOL_CATEGORIES.GENERAL;
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
  const categoryMap: Record<string, CategoryDisplayInfo> = {
    [TOOL_CATEGORIES.GENERAL]: {
      name: "General Assistant",
      icon: "💬",
      description:
        "Versatile AI assistant supporting conversation, analysis, programming and various tasks",
      color: "#1677ff",
    },
    [TOOL_CATEGORIES.FILE_READER]: {
      name: "File Operations",
      icon: "📁",
      description:
        "File reading, creation, updating, deletion and search functions",
      color: "#52c41a",
    },
    [TOOL_CATEGORIES.COMMAND_EXECUTOR]: {
      name: "Command Execution",
      icon: "⚡",
      description: "Safely execute system commands and scripts",
      color: "#722ed1",
    },
    Pinned: {
      name: "Pinned Chats",
      icon: "📌",
      description: "Important pinned chat records",
      color: "#f5222d",
    },
  };

  return categoryMap[category] || categoryMap[TOOL_CATEGORIES.GENERAL];
};

/**
 * Get sorting weight for tool categories
 */
export const getCategoryWeight = (category: string): number => {
  const weights: Record<string, number> = {
    Pinned: 0,
    [TOOL_CATEGORIES.GENERAL]: 1,
    [TOOL_CATEGORIES.FILE_READER]: 2,
    [TOOL_CATEGORIES.COMMAND_EXECUTOR]: 3,
  };

  return weights[category] || 999;
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
