import { ChatItem } from "../types/chat";

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