import React, { useEffect } from "react";
import { Layout } from "antd";
import { ChatSidebar } from "../components/ChatSidebar";
import { ChatView } from "../components/ChatView";
import { listen } from "@tauri-apps/api/event";
import { useChat } from "../contexts/ChatContext";
import "./styles.css";

export const MainLayout: React.FC = () => {
  const { addChat, selectChat, initiateAIResponse } = useChat();

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

        // Initiate AI response for the new chat
        // Small delay to ensure state propagation before initiating AI response
        await new Promise((resolve) => setTimeout(resolve, 50));
        console.log("[MainLayout] Calling initiateAIResponse for new chat.");
        await initiateAIResponse();
        console.log("[MainLayout] initiateAIResponse call completed.");
      }
    );

    return () => {
      unlisten.then((f) => f());
    };
  }, [addChat, selectChat, initiateAIResponse]);

  return (
    <Layout className="main-layout">
      <ChatSidebar />
      <Layout className="content-layout">
        <ChatView />
      </Layout>
    </Layout>
  );
};
