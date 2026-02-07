import React, { useEffect, useMemo, useRef, useState } from "react";
import { Layout, theme } from "antd";
import { ChatSidebar } from "../pages/ChatPage/components/ChatSidebar";
import { ChatView } from "../pages/ChatPage/components/ChatView";
import { FavoritesPanel } from "../pages/ChatPage/components/FavoritesPanel";
import { SystemSettingsPage } from "../pages/SettingsPage/components/SystemSettingsPage";
import { ChatAutoTitleEffect } from "../pages/ChatPage/components/ChatAutoTitleEffect";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "../pages/ChatPage/store";
import { useChatManager } from "../pages/ChatPage/hooks/useChatManager";
import { ChatItem, Message } from "../pages/ChatPage/types/chat";
import { useSettingsViewStore } from "../shared/store/settingsViewStore";

export const MainLayout: React.FC<{
  themeMode: "light" | "dark";
  onThemeModeChange: (mode: "light" | "dark") => void;
}> = ({ themeMode, onThemeModeChange }) => {
  const settingsOpen = useSettingsViewStore((s) => s.isOpen);
  const closeSettings = useSettingsViewStore((s) => s.close);
  const { token } = theme.useToken();
  const addChat = useAppStore((state) => state.addChat);
  const selectChat = useAppStore((state) => state.selectChat);
  const currentChatId = useAppStore((state) => state.currentChatId);
  const chats = useAppStore((state) => state.chats);
  const { sendMessage } = useChatManager();

  // Memoize currentMessages to avoid infinite loop
  const currentMessages = useMemo<Message[]>(() => {
    if (!currentChatId) return [];
    const chat = chats.find((c) => c.id === currentChatId);
    return chat?.messages ?? [];
  }, [chats, currentChatId]);
  const pendingAIRef = useRef<{ chatId: string; message: string } | null>(null);
  const sendMessageRef = useRef(sendMessage);

  // Keep sendMessage reference stable
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);
  const [showFavorites, setShowFavorites] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
      const unlisten = listen<{ message: string }>(
        "new-chat-message",
        async (event) => {
          console.log("[MainLayout] Received new-chat-message event:", event);
          const messageContent = event.payload.message;
          console.log(
            "[MainLayout] Message content from spotlight:",
            messageContent,
          );

          // Close settings if open
          if (settingsOpen) {
            closeSettings();
          }

          const newChat: Omit<ChatItem, "id"> = {
            title: "New Chat from Spotlight",
            createdAt: Date.now(),
            messages: [],
            pinned: false,
            config: {
              systemPromptId: "general_assistant",
              baseSystemPrompt: "You are a helpful assistant.",
              lastUsedEnhancedPrompt: null,
            },
            currentInteraction: null,
          };

          // Create chat and get the new ID
          const newChatId = await addChat(newChat);
          console.log("[MainLayout] New chat created with ID:", newChatId);

          if (newChatId) {
            // Select the new chat
            selectChat(newChatId);

            // Store message to be sent after chat is selected
            pendingAIRef.current = {
              chatId: newChatId,
              message: messageContent,
            };
          }
        },
      );

      return () => {
        unlisten.then((f) => f());
      };
    } else {
      console.log(
        "[MainLayout] Not running in Tauri environment, skipping event listener",
      );
    }
  }, [addChat, selectChat, settingsOpen, closeSettings]);

  // Auto-send message when chat is created and switched
  useEffect(() => {
    if (pendingAIRef.current && currentChatId === pendingAIRef.current.chatId) {
      const { message } = pendingAIRef.current;
      console.log(
        `[MainLayout] Auto-sending spotlight message to chat ${currentChatId}`,
      );
      // Use a small delay to ensure chat is fully loaded
      const timer = setTimeout(() => {
        sendMessageRef.current(message);
        pendingAIRef.current = null;
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [currentChatId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
    <Layout
      style={{
        minHeight: "100vh",
        height: "100vh",
        overflow: "hidden",
        background: token.colorBgLayout,
      }}
    >
      {!settingsOpen ? <ChatSidebar /> : null}
      {!settingsOpen ? <ChatAutoTitleEffect /> : null}
      <Layout
        style={{
          display: "flex",
          flexDirection: "column",
          background: token.colorBgContainer,
        }}
      >
        {settingsOpen ? (
          <SystemSettingsPage
            themeMode={themeMode}
            onThemeModeChange={onThemeModeChange}
            onBack={closeSettings}
          />
        ) : (
          <ChatView />
        )}
      </Layout>
      {!settingsOpen &&
        showFavorites &&
        currentChatId &&
        currentMessages.length > 0 && <FavoritesPanel />}
    </Layout>
  );
};
