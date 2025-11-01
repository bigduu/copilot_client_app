import React, { useEffect, useRef, useState } from "react";
import { Layout } from "antd";
import { ChatSidebar } from "../components/ChatSidebar";
import { ChatView } from "../components/ChatView";
import { FavoritesPanel } from "../components/FavoritesPanel";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "../store";
import { useChatManager } from "../hooks/useChatManager";
import { ChatItem } from "../types/chat";

import "./styles.css";

export const MainLayout: React.FC<{
  themeMode: "light" | "dark";
  onThemeModeChange: (mode: "light" | "dark") => void;
}> = ({ themeMode, onThemeModeChange }) => {
  // Direct access to Zustand store
  const addChat = useAppStore((state) => state.addChat);
  const selectChat = useAppStore((state) => state.selectChat);
  const { sendMessage, currentMessages, currentChatId } = useChatManager();
  const pendingAIRef = useRef<{ chatId: string; message: string } | null>(null);
  const [showFavorites, setShowFavorites] = useState(true);

  useEffect(() => {
    // Check if we're running in Tauri environment
    if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
      const unlisten = listen<{ message: string }>(
        "new-chat-message",
        async (event) => {
          console.log("[MainLayout] Received new-chat-message event:", event);
          const messageContent = event.payload.message;
          console.log(
            "[MainLayout] Message content from spotlight:",
            messageContent
          );

          // Create a full ChatItem object to add
          const newChat: Omit<ChatItem, "id"> = {
            title: "New Chat from Spotlight",
            createdAt: Date.now(),
            messages: [],
            pinned: false,
            config: {
              systemPromptId: "general_assistant", // Default prompt
              baseSystemPrompt: "You are a helpful assistant.", // Default content
              toolCategory: "general_assistant",
              lastUsedEnhancedPrompt: null,
            },
            currentInteraction: null,
          };

          addChat(newChat);

          // The chat ID is generated inside the store, so we need to get it after adding.
          // We'll use a slight delay to ensure the state is updated.
          setTimeout(() => {
            const newChatId = useAppStore.getState().currentChatId;
            if (newChatId) {
              console.log("[MainLayout] New chat ID created:", newChatId);
              // Mark that AI reply needs to be triggered for this specific chat and message
              pendingAIRef.current = {
                chatId: newChatId,
                message: messageContent,
              };
            }
          }, 100);
        }
      );

      return () => {
        unlisten.then((f) => f());
      };
    } else {
      console.log("[MainLayout] Not running in Tauri environment, skipping event listener");
    }
  }, [addChat, selectChat]);

  useEffect(() => {
    // When a pending AI response is flagged, send the message using the chat controller
    if (pendingAIRef.current) {
      const { chatId, message } = pendingAIRef.current;
      // Ensure the current chat is the one we just created
      if (chatId === currentChatId) {
        console.log(
          `[MainLayout] useEffect: Auto-sending message for new chat ${chatId}.`
        );
        sendMessage(message);
        pendingAIRef.current = null; // Clear the flag
      }
    }
  }, [currentChatId, sendMessage]); // Depend on currentChatId to re-check when it changes

  // Add keyboard shortcut for toggling favorites
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle favorites panel with F key
      if (
        e.key === "f" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        setShowFavorites((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <Layout className="main-layout">
      <ChatSidebar
        themeMode={themeMode}
        onThemeModeChange={onThemeModeChange}
      />
      <Layout className="content-layout">
        <ChatView />
      </Layout>
      {/* Favorites Panel */}
      {showFavorites && currentChatId && currentMessages.length > 0 && (
        <FavoritesPanel />
      )}
    </Layout>
  );
};
