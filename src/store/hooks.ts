import { useAppStore } from '.';
import { ChatItem } from '../types/chat';

/**
 * Convenience hook to get the list of chats.
 */
export const useChatList = () => useAppStore(state => state.chats);

/**
 * Convenience hook to get the currently selected chat.
 */
export const useCurrentChat = (): ChatItem | null => {
  const currentChatId = useAppStore(state => state.currentChatId);
  const chats = useAppStore(state => state.chats);
  return chats.find(chat => chat.id === currentChatId) || null;
};

/**
 * Convenience hook to get the messages for the currently selected chat.
 */
export const useCurrentMessages = () => {
  const currentChatId = useAppStore(state => state.currentChatId);
  const messages = useAppStore(state => state.messages);
  return currentChatId ? messages[currentChatId] || [] : [];
};

/**
 * Convenience hook to get the ID of the last active chat.
 */
export const useLatestActiveChatId = () => useAppStore(state => state.latestActiveChatId);
