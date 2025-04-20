import { useState, useCallback, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { ChatItem } from "../types/chat";
import { generateChatTitle } from "../utils/chatUtils";

const STORAGE_KEY = "copilot_chats";

export const useChats = () => {
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  const loadChats = useCallback(() => {
    try {
      const savedChats = localStorage.getItem(STORAGE_KEY);
      if (savedChats) {
        const parsedChats = JSON.parse(savedChats) as ChatItem[];
        setChats(parsedChats);
        
        if (!currentChatId && parsedChats.length > 0) {
          parsedChats.sort((a, b) => b.createdAt - a.createdAt);
          setCurrentChatId(parsedChats[0].id);
        }
      }
    } catch (error) {
      console.error("Failed to load chats from storage:", error);
    }
  }, [currentChatId]);

  const saveChats = useCallback(() => {
    try {
      const sortedChats = [...chats].sort((a, b) => b.createdAt - a.createdAt);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sortedChats));
    } catch (error) {
      console.error("Failed to save chats to storage:", error);
    }
  }, [chats]);

  useEffect(() => {
    loadChats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addChat = useCallback((): string => {
    const newChatId = uuidv4();
    const chatNumber = chats.length + 1;
    const newChat: ChatItem = {
      id: newChatId,
      title: generateChatTitle(chatNumber),
      messages: [],
      createdAt: Date.now(),
    };

    console.log("Creating new chat:", newChatId);

    // Update the chats state
    setChats((prevChats) => {
      const updatedChats = [newChat, ...prevChats];
      // Save to local storage
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedChats));
      return updatedChats;
    });

    // Set current chat ID
    setCurrentChatId(newChatId);

    return newChatId;
  }, [chats]);

  const selectChat = useCallback((chatId: string | null) => {
    setCurrentChatId(chatId);
  }, []);

  const deleteChat = useCallback(
    (chatId: string) => {
      const chatsAfterDeletion = chats.filter((chat) => chat.id !== chatId);
      setChats(chatsAfterDeletion);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(chatsAfterDeletion));

      if (currentChatId === chatId) {
        const remainingChatsSorted = [...chatsAfterDeletion].sort(
          (a, b) => b.createdAt - a.createdAt
        );
        const nextChatId =
          remainingChatsSorted.length > 0 ? remainingChatsSorted[0].id : null;
        setCurrentChatId(nextChatId);
      }
    },
    [chats, currentChatId]
  );

  const updateChatMessages = useCallback(
    (chatId: string, messages: ChatItem["messages"]) => {
      setChats((prevChats) => {
        const updatedChats = prevChats.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages,
                // Update title if this is the first message
                title:
                  chat.messages.length === 0 && 
                  chat.title.startsWith("Chat ") &&
                  messages.length > 0 && 
                  messages[0].role === "user"
                    ? messages[0].content.substring(0, 30) +
                      (messages[0].content.length > 30 ? "..." : "")
                    : chat.title,
              }
            : chat
        );

        // Save to storage
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedChats));
        return updatedChats;
      });
    },
    []
  );

  // Delete all chats
  const deleteAllChats = useCallback(() => {
    try {
      console.log("Deleting all chats");

      // Create a copy of chat IDs first since we'll be modifying the array during deletion
      const chatIds = [...chats].map((chat) => chat.id);

      // Delete each chat individually
      chatIds.forEach((chatId) => {
        console.log(`Deleting chat: ${chatId}`);
        // Use this direct approach instead of calling deleteChat to avoid complexity
        // with changing selectedChat during iteration
        setChats((prevChats) => prevChats.filter((chat) => chat.id !== chatId));
      });

      // Clear current chat ID
      setCurrentChatId(null);

      // Ensure localStorage is cleared
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));

      // Create a new chat automatically
      setTimeout(() => {
        const newChatId = addChat();
        console.log(`Created new chat after deletion: ${newChatId}`);
      }, 100); // Small delay to ensure state updates have completed

      console.log("All chats deleted successfully");
    } catch (error) {
      console.error("Failed to delete all chats:", error);

      // Fallback: clear state directly
      setChats([]);
      setCurrentChatId(null);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));

      // Still try to create a new chat
      setTimeout(() => {
        addChat();
      }, 100);
    }
  }, [chats, addChat]);

  const currentChat = chats.find((chat) => chat.id === currentChatId) || null;
  const currentMessages = currentChat?.messages || [];


  return {
    chats,
    currentChatId,
    currentChat,
    currentMessages,
    addChat,
    selectChat,
    deleteChat,
    updateChatMessages,
    saveChats,
    deleteAllChats
  };
}; 