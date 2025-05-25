import React from "react";
import { useState, useCallback, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { ChatItem, Message } from "../../types/chat";
import { DEFAULT_MESSAGE } from "../../constants";
import { generateChatTitle } from "../../utils/chatUtils";

const STORAGE_KEY = "copilot_chats";
const SYSTEM_PROMPT_KEY = "system_prompt";

interface UseChatsReturn {
  chats: ChatItem[];
  currentChatId: string | null;
  currentChat: ChatItem | null;
  currentMessages: Message[];
  addChat: (firstUserMessageContent?: string) => string;
  selectChat: (chatId: string | null) => void;
  deleteChat: (chatId: string) => void;
  deleteChats: (chatIds: string[]) => void;
  saveChats: () => void;
  deleteAllChats: () => void;
  pinChat: (chatId: string) => void;
  unpinChat: (chatId: string) => void;
  deleteEmptyChats: () => void;
  setChats: React.Dispatch<React.SetStateAction<ChatItem[]>>;
  updateChatMessages: (chatId: string, messages: Message[]) => void;
  updateChatSystemPrompt: (chatId: string, systemPrompt: string) => void;
}

const FALLBACK_MODEL_IN_CHATS = "gpt-4o"; // Consistent fallback

export const useChats = (defaultModel?: string): UseChatsReturn => {
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  const migrateExistingChats = useCallback((chats: ChatItem[]): ChatItem[] => {
    return chats.map((chat) => {
      if (chat.systemPrompt) return chat; // Already migrated

      // Look for system message in existing messages
      const systemMessage = chat.messages.find((m) => m.role === "system");
      return {
        ...chat,
        systemPrompt:
          systemMessage?.content ||
          localStorage.getItem(SYSTEM_PROMPT_KEY) ||
          DEFAULT_MESSAGE,
      };
    });
  }, []);

  const loadChats = useCallback(() => {
    try {
      const savedChats = localStorage.getItem(STORAGE_KEY);
      if (savedChats) {
        const parsedChats = JSON.parse(savedChats) as ChatItem[];
        // Migrate existing chats to include system prompts
        const migratedChats = migrateExistingChats(parsedChats);
        setChats(migratedChats);

        if (!currentChatId && migratedChats.length > 0) {
          migratedChats.sort((a, b) => b.createdAt - a.createdAt);
          setCurrentChatId(migratedChats[0].id);
        }
      }
    } catch (error) {
      console.error("Failed to load chats from storage:", error);
    }
  }, [currentChatId, migrateExistingChats]);

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

  const addChat = useCallback(
    (firstUserMessageContent?: string): string => {
      const newChatId = uuidv4();
      const chatNumber = chats.length + 1;
      const currentSystemPrompt =
        localStorage.getItem(SYSTEM_PROMPT_KEY) || DEFAULT_MESSAGE;
      const newChatModel = defaultModel || FALLBACK_MODEL_IN_CHATS;

      let initialMessages: ChatItem["messages"] = [];
      if (firstUserMessageContent) {
        initialMessages.push({
          role: "user",
          content: firstUserMessageContent,
          id: uuidv4(), // Add ID to user message
        });
      }

      const newChat: ChatItem = {
        id: newChatId,
        title: firstUserMessageContent
          ? firstUserMessageContent.substring(0, 30) +
            (firstUserMessageContent.length > 30 ? "..." : "")
          : generateChatTitle(chatNumber),
        messages: initialMessages,
        createdAt: Date.now(),
        systemPrompt: currentSystemPrompt,
        model: newChatModel, // Set the model for the new chat
        pinned: false, // New chats are not pinned by default
      };

      console.log("Creating new chat:", newChatId, "with model:", newChatModel);

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
    },
    [chats, defaultModel]
  );

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

  const deleteChats = useCallback(
    (chatIds: string[]) => {
      try {
        console.log("Deleting all chats");
        setChats((prevChats) => {
          const filtered = prevChats.filter(
            (chat) => !chatIds.includes(chat.id)
          );
          localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
          return filtered;
        });
        setCurrentChatId(null);
      } catch (error) {
        console.error("Failed to delete all chats:", error);
      }
    },
    [chats] // Removed currentChatId as it's not directly used for filtering, set separately
  );

  const updateChatMessages = useCallback(
    (chatId: string, newMessages: ChatItem["messages"]) => {
      console.log(
        `[useChats] updateChatMessages called for chatId: ${chatId}. New messages count: ${newMessages.length}`
      );
      if (newMessages.length > 0) {
        console.log(
          `[useChats] First new message content: ${newMessages[0].content.substring(
            0,
            50
          )}...`
        );
      }
      setChats((prevChats) => {
        const chatExists = prevChats.some((chat) => chat.id === chatId);
        if (!chatExists) {
          console.error(
            `[useChats] Attempted to update messages for non-existent chat ID: ${chatId}`
          );
          return prevChats;
        }
        const updatedChats = prevChats.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages: newMessages, // Directly use the newMessages array passed in
                // Update title if this is the first user message in an empty chat
                title:
                  chat.messages.length === 0 && // old messages were empty
                  newMessages.length > 0 && // new messages are not
                  newMessages[0].role === "user" &&
                  chat.title.startsWith("Chat ") // only update default titles
                    ? newMessages[0].content.substring(0, 30) +
                      (newMessages[0].content.length > 30 ? "..." : "")
                    : chat.title,
              }
            : chat
        );

        console.log(
          `[useChats] Chat ${chatId} updated. New total messages: ${
            updatedChats.find((c) => c.id === chatId)?.messages.length
          }`
        );
        // Save to storage
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedChats));
        return updatedChats;
      });
    },
    []
  );

  // Add new function to update a chat's system prompt
  const updateChatSystemPrompt = useCallback(
    (chatId: string, systemPrompt: string) => {
      console.log(
        `[useChats] updateChatSystemPrompt called for chatId: ${chatId}`
      );

      setChats((prevChats) => {
        const chatExists = prevChats.some((chat) => chat.id === chatId);
        if (!chatExists) {
          console.error(
            `[useChats] Attempted to update system prompt for non-existent chat ID: ${chatId}`
          );
          return prevChats;
        }

        const updatedChats = prevChats.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                systemPrompt,
              }
            : chat
        );

        console.log(`[useChats] Chat ${chatId} system prompt updated.`);
        // Save to storage
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedChats));
        return updatedChats;
      });
    },
    []
  );

  // Add pin/unpin chat functions
  const pinChat = useCallback((chatId: string) => {
    setChats((prevChats) => {
      const updatedChats = prevChats.map((chat) =>
        chat.id === chatId ? { ...chat, pinned: true } : chat
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedChats));
      return updatedChats;
    });
  }, []);

  const unpinChat = useCallback((chatId: string) => {
    setChats((prevChats) => {
      const updatedChats = prevChats.map((chat) =>
        chat.id === chatId ? { ...chat, pinned: false } : chat
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedChats));
      return updatedChats;
    });
  }, []);

  // Delete all chats except pinned
  const deleteAllChats = useCallback(() => {
    try {
      console.log("Deleting all chats");
      setChats((prevChats) => {
        const filtered = prevChats.filter((chat) => chat.pinned);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
        return filtered;
      });
      setCurrentChatId(null);
    } catch (error) {
      console.error("Failed to delete all chats:", error);
    }
  }, []);

  // Add new function to delete empty chats (not pinned)
  const deleteEmptyChats = useCallback(() => {
    try {
      console.log("Deleting empty chats (not pinned)");
      let newCurrentChatId = currentChatId;
      setChats((prevChats) => {
        const chatsToKeep = prevChats.filter(
          (chat) => chat.pinned || chat.messages.length > 0
        );

        // If current chat is deleted, try to select another one
        if (currentChatId && !chatsToKeep.find((c) => c.id === currentChatId)) {
          const remainingChatsSorted = [...chatsToKeep].sort(
            (a, b) => b.createdAt - a.createdAt
          );
          newCurrentChatId =
            remainingChatsSorted.length > 0 ? remainingChatsSorted[0].id : null;
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(chatsToKeep));
        return chatsToKeep;
      });
      // Update currentChatId if it was part of the deleted empty chats
      if (newCurrentChatId !== currentChatId) {
        setCurrentChatId(newCurrentChatId);
      }
    } catch (error) {
      console.error("Failed to delete empty chats:", error);
    }
  }, [currentChatId]);

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
    deleteChats,
    updateChatMessages,
    updateChatSystemPrompt,
    saveChats,
    deleteAllChats,
    deleteEmptyChats,
    pinChat,
    unpinChat,
    setChats,
  };
};
