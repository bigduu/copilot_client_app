import React, { useEffect, useRef } from "react";
import { Layout } from "antd";
import { ChatSidebar } from "../components/ChatSidebar";
import { ChatView } from "../components/ChatView";
import { listen } from "@tauri-apps/api/event";
import { useChat } from "../contexts/ChatContext";
import "./styles.css";

export const MainLayout: React.FC<{
  themeMode: "light" | "dark";
  onThemeModeChange: (mode: "light" | "dark") => void;
}> = ({ themeMode, onThemeModeChange }) => {
  const { addChat, selectChat, initiateAIResponse, currentMessages } =
    useChat();
  const pendingAIRef = useRef(false);

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
        const chatId = addChat(messageContent);
        console.log(
          "[MainLayout] New chat ID created with initial message:",
          chatId
        );

        // Ensure the new chat is selected (addChat should already do this)
        selectChat(chatId);

        // 标记需要自动触发 AI 回复
        pendingAIRef.current = true;
      }
    );

    return () => {
      unlisten.then((f) => f());
    };
  }, [addChat, selectChat]);

  useEffect(() => {
    // 只有在 pendingAIRef 标记为 true，且当前 chat 只有一条 user 消息时才触发
    if (
      pendingAIRef.current &&
      currentMessages.length === 1 &&
      currentMessages[0].role === "user"
    ) {
      console.log(
        "[MainLayout] useEffect: Auto triggering AI response for new chat."
      );
      initiateAIResponse();
      pendingAIRef.current = false;
    }
  }, [currentMessages, initiateAIResponse]);

  return (
    <Layout className="main-layout">
      <ChatSidebar
        themeMode={themeMode}
        onThemeModeChange={onThemeModeChange}
      />
      <Layout className="content-layout">
        <ChatView />
      </Layout>
    </Layout>
  );
};
