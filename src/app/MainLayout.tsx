import React, { useEffect, useMemo, useState } from "react";
import { Layout, theme } from "antd";
import { ChatSidebar } from "../pages/ChatPage/components/ChatSidebar";
import { ChatView } from "../pages/ChatPage/components/ChatView";
import { FavoritesPanel } from "../pages/ChatPage/components/FavoritesPanel";
import { SystemSettingsPage } from "../pages/SettingsPage/components/SystemSettingsPage";
import { ChatAutoTitleEffect } from "../pages/ChatPage/components/ChatAutoTitleEffect";
import { useAppStore } from "../pages/ChatPage/store";
import { Message } from "../pages/ChatPage/types/chat";
import { useSettingsViewStore } from "../shared/store/settingsViewStore";

export const MainLayout: React.FC<{
  themeMode: "light" | "dark";
  onThemeModeChange: (mode: "light" | "dark") => void;
}> = ({ themeMode, onThemeModeChange }) => {
  const settingsOpen = useSettingsViewStore((s) => s.isOpen);
  const closeSettings = useSettingsViewStore((s) => s.close);
  const { token } = theme.useToken();
  const currentChatId = useAppStore((state) => state.currentChatId);
  const chats = useAppStore((state) => state.chats);

  // Memoize currentMessages to avoid infinite loop
  const currentMessages = useMemo<Message[]>(() => {
    if (!currentChatId) return [];
    const chat = chats.find((c) => c.id === currentChatId);
    return chat?.messages ?? [];
  }, [chats, currentChatId]);

  const [showFavorites, setShowFavorites] = useState(true);

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
