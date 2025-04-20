import React from "react";
import { Layout } from "antd";
import { ChatSidebar } from "../components/ChatSidebar";
import { ChatView } from "../components/ChatView";
import { MessageInput } from "../components/MessageInput";
import "./styles.css";

const { Content } = Layout;

export const MainLayout: React.FC = () => {
  return (
    <Layout className="main-layout">
      <ChatSidebar />
      <Layout className="content-layout">
        <Content className="content-container">
          <ChatView />
          <MessageInput />
        </Content>
      </Layout>
    </Layout>
  );
};
