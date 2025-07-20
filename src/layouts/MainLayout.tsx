import React, { useEffect, useRef, useState } from "react";
import { Layout } from "antd";
import { ChatSidebar } from "../components/ChatSidebar";
import { ChatView } from "../components/ChatView";
import { FavoritesPanel } from "../components/FavoritesPanel";
import { listen } from "@tauri-apps/api/event";
import { useChatStore, useCurrentMessages } from "../store/chatStore";

import "./styles.css";

export const MainLayout: React.FC<{
  themeMode: "light" | "dark";
  onThemeModeChange: (mode: "light" | "dark") => void;
}> = ({ themeMode, onThemeModeChange }) => {
  // Direct access to Zustand store
  const addChat = useChatStore((state) => state.addChat);
  const selectChat = useChatStore((state) => state.selectChat);
  const initiateAIResponse = useChatStore((state) => state.initiateAIResponse);
  const currentMessages = useCurrentMessages();
  const currentChatId = useChatStore((state) => state.currentChatId);
  const pendingAIRef = useRef(false);
  const [showFavorites, setShowFavorites] = useState(true);

  useEffect(() => {
    const unlisten = listen<{ message: string }>(
      "new-chat-message",
      async (event) => {
        console.log("[MainLayout] Received new-chat-message event:", event);
        const messageContent = event.payload.message;
        console.log(
          "[MainLayout] Message content from spotlight:",
          messageContent
        );

        // Add chat with the initial message content
        addChat({
          title: "New Chat",
          messages: [],
          createdAt: Date.now(),
        });

        // Get the current chat ID (addChat automatically selects the new chat)
        const currentChatId = useChatStore.getState().currentChatId;
        console.log(
          "[MainLayout] New chat ID created with initial message:",
          currentChatId
        );

        // Mark that AI reply needs to be triggered automatically
        pendingAIRef.current = true;
      }
    );

    return () => {
      unlisten.then((f) => f());
    };
  }, [addChat, selectChat]);

  useEffect(() => {
    // Only trigger when pendingAIRef is marked as true and current chat has only one user message
    if (
      pendingAIRef.current &&
      currentMessages.length === 1 &&
      currentMessages[0].role === "user"
    ) {
      console.log(
        "[MainLayout] useEffect: Auto triggering AI response for new chat."
      );
      if (currentChatId) {
        initiateAIResponse(currentChatId, currentMessages[0].content);
      }
      pendingAIRef.current = false;
    }
  }, [currentMessages, initiateAIResponse]);

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
