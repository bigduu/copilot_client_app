import { ChatItem, ToolCategory } from "../types/chat";

export const generateChatTitle = (chatNumber: number): string => {
    const now = new Date();
    const date = now.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
    return `Chat ${chatNumber} - ${date}`;
};

export const groupChatsByDate = (chats: ChatItem[]): Record<string, ChatItem[]> => {
    const grouped: Record<string, ChatItem[]> = {};
    // Add pinned group at the top if any pinned chats
    const pinnedChats = chats.filter(chat => chat.pinned);
    if (pinnedChats.length > 0) {
        grouped['Pinned'] = pinnedChats.sort((a, b) => b.createdAt - a.createdAt);
    }
    // Group the rest by date
    chats.filter(chat => !chat.pinned).forEach(chat => {
        const date = new Date(chat.createdAt);
        const dateString = date.toLocaleDateString(undefined, { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
        if (!grouped[dateString]) {
            grouped[dateString] = [];
        }
        grouped[dateString].push(chat);
    });
    // Sort each group by createdAt in descending order (newest first)
    Object.keys(grouped).forEach(date => {
        grouped[date].sort((a, b) => b.createdAt - a.createdAt);
    });
    return grouped;
};

/**
 * 按工具类别分组聊天，每个类别内部按时间排序
 */
export const groupChatsByToolCategory = (
  chats: ChatItem[]
): Record<string, ChatItem[]> => {
  const grouped: Record<string, ChatItem[]> = {};
  
  // 先处理置顶聊天
  const pinnedChats = chats.filter(chat => chat.pinned);
  if (pinnedChats.length > 0) {
    grouped['Pinned'] = pinnedChats.sort((a, b) => b.createdAt - a.createdAt);
  }
  
  // 按工具类别分组非置顶聊天
  chats.filter(chat => !chat.pinned).forEach(chat => {
    const category = chat.toolCategory || ToolCategory.GENERAL;
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(chat);
  });
  
  // 每个类别内部按时间排序（最新的在前）
  Object.keys(grouped).forEach(category => {
    if (category !== 'Pinned') {
      grouped[category].sort((a, b) => b.createdAt - a.createdAt);
    }
  });
  
  return grouped;
};

/**
 * 获取类别显示信息
 */
export interface CategoryDisplayInfo {
  name: string;
  icon: string;
  description: string;
  color?: string;
}

export const getCategoryDisplayInfo = (category: string): CategoryDisplayInfo => {
  const categoryMap: Record<string, CategoryDisplayInfo> = {
    [ToolCategory.GENERAL]: {
      name: '通用助手',
      icon: '💬',
      description: '全能AI助手，支持对话、分析、编程等各种任务',
      color: '#1677ff'
    },
    [ToolCategory.FILE_READER]: {
      name: '文件读取',
      icon: '📖',
      description: '快速读取和分析各种文件内容',
      color: '#52c41a'
    },
    [ToolCategory.FILE_CREATOR]: {
      name: '文件创建',
      icon: '📝',
      description: '高效创建新文件和目录结构',
      color: '#faad14'
    },
    [ToolCategory.FILE_DELETER]: {
      name: '文件删除',
      icon: '🗑️',
      description: '安全删除文件和目录',
      color: '#ff4d4f'
    },
    [ToolCategory.COMMAND_EXECUTOR]: {
      name: '命令执行',
      icon: '⚡',
      description: '安全执行系统命令和脚本',
      color: '#722ed1'
    },
    [ToolCategory.FILE_UPDATER]: {
      name: '文件更新',
      icon: '✏️',
      description: '精确更新文件内容和结构',
      color: '#13c2c2'
    },
    [ToolCategory.FILE_SEARCHER]: {
      name: '文件搜索',
      icon: '🔍',
      description: '强大的文件内容搜索功能',
      color: '#eb2f96'
    },
    'Pinned': {
      name: '置顶聊天',
      icon: '📌',
      description: '重要的置顶聊天记录',
      color: '#f5222d'
    }
  };
  
  return categoryMap[category] || categoryMap[ToolCategory.GENERAL];
};

/**
 * 获取工具类别的排序权重
 */
export const getCategoryWeight = (category: string): number => {
  const weights: Record<string, number> = {
    'Pinned': 0,
    [ToolCategory.GENERAL]: 1,
    [ToolCategory.FILE_READER]: 2,
    [ToolCategory.FILE_CREATOR]: 3,
    [ToolCategory.FILE_UPDATER]: 4,
    [ToolCategory.FILE_DELETER]: 5,
    [ToolCategory.FILE_SEARCHER]: 6,
    [ToolCategory.COMMAND_EXECUTOR]: 7
  };
  
  return weights[category] || 999;
};

/**
 * 对分组结果按权重排序
 */
export const sortGroupedChatsByWeight = (
  grouped: Record<string, ChatItem[]>
): Record<string, ChatItem[]> => {
  const sortedEntries = Object.entries(grouped).sort(([categoryA], [categoryB]) => {
    return getCategoryWeight(categoryA) - getCategoryWeight(categoryB);
  });
  
  return Object.fromEntries(sortedEntries);
};