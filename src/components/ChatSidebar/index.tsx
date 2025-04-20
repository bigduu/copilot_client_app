import React, { useState } from "react";
import { Layout, Button, Modal, Popconfirm } from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { useChat } from "../../contexts/ChatContext";
import { ChatItem as ChatItemComponent } from "../ChatItem";
import { ChatItem } from "../../types/chat";
import { groupChatsByDate } from "../../utils/chatUtils";
import SystemPromptModal from "../SystemPromptModal";
import "./styles.css";

const { Sider } = Layout;

export const ChatSidebar: React.FC = () => {
  const {
    chats,
    addChat,
    selectChat,
    currentChatId,
    deleteChat,
    deleteAllChats,
  } = useChat();
  const [isPromptModalVisible, setIsPromptModalVisible] = useState(false);

  // Group chats by date
  const groupedChats = groupChatsByDate(chats);

  const handleDelete = (chatId: string) => {
    Modal.confirm({
      title: "Delete Chat",
      content:
        "Are you sure you want to delete this chat? This action cannot be undone.",
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      onOk: () => {
        deleteChat(chatId);
      },
    });
  };

  const handleDeleteAll = () => {
    deleteAllChats();
  };

  const handleOpenSystemPrompt = () => {
    console.log("Opening system prompt modal");
    setIsPromptModalVisible(true);
  };

  const handleCloseSystemPrompt = () => {
    console.log("Closing system prompt modal");
    setIsPromptModalVisible(false);
  };

  return (
    <Sider width={250} theme="light" className="chat-sidebar">
      <div className="sidebar-header">
        <Button
          type="primary"
          onClick={addChat}
          className="new-chat-button"
          icon={<PlusOutlined />}
          block
        >
          New Chat
        </Button>
      </div>

      <div className="sidebar-buttons">
        <Button
          onClick={handleOpenSystemPrompt}
          className="system-prompt-button"
          icon={<SettingOutlined />}
        >
          System Prompt
        </Button>

        <Popconfirm
          title="Delete all chats"
          description="Are you sure you want to delete all your chats? This action cannot be undone."
          onConfirm={handleDeleteAll}
          okText="Delete All"
          cancelText="Cancel"
          okButtonProps={{ danger: true }}
        >
          <Button
            danger
            className="delete-all-button"
            icon={<DeleteOutlined />}
          >
            Delete All
          </Button>
        </Popconfirm>
      </div>

      <div className="chat-list">
        {Object.entries(groupedChats).map(([date, dateChats]) => (
          <div key={date} className="chat-date-group">
            <div className="date-header">{date}</div>
            {dateChats.map((chat: ChatItem) => (
              <ChatItemComponent
                key={chat.id}
                chat={chat}
                isSelected={chat.id === currentChatId}
                onSelect={selectChat}
                onDelete={handleDelete}
              />
            ))}
          </div>
        ))}
      </div>

      <SystemPromptModal
        visible={isPromptModalVisible}
        onClose={handleCloseSystemPrompt}
      />
    </Sider>
  );
};
