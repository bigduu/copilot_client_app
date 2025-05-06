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
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);

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
    setIsPromptModalOpen(true);
  };

  const handleCloseSystemPrompt = () => {
    console.log("Closing system prompt modal");
    setIsPromptModalOpen(false);
  };

  return (
    <Sider className="chat-sidebar" width={250}>
      <div className="sidebar-header">
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            const newChatId = addChat();
            selectChat(newChatId);
          }}
          block
          className="new-chat-button"
        >
          New Chat
        </Button>
      </div>

      <div className="sidebar-buttons">
        <Button
          icon={<SettingOutlined />}
          onClick={handleOpenSystemPrompt}
          className="system-prompt-button"
        >
          System Prompt
        </Button>

        <Popconfirm
          title="Delete all chats"
          description="Are you sure? This action cannot be undone."
          onConfirm={handleDeleteAll}
          okText="Yes, delete all"
          cancelText="Cancel"
          placement="right"
        >
          <Button
            danger
            icon={<DeleteOutlined />}
            className="delete-all-button"
          >
            Delete All Chats
          </Button>
        </Popconfirm>
      </div>

      <div className="chat-list">
        {Object.entries(groupedChats).map(([date, chatsInGroup]) => (
          <div key={date} className="chat-date-group">
            <div className="date-header">{date}</div>
            {chatsInGroup.map((chat) => (
              <ChatItemComponent
                key={chat.id}
                chat={chat}
                isSelected={chat.id === currentChatId}
                onSelect={() => selectChat(chat.id)}
                onDelete={() => handleDelete(chat.id)}
              />
            ))}
          </div>
        ))}
      </div>

      <SystemPromptModal
        open={isPromptModalOpen}
        onClose={handleCloseSystemPrompt}
      />
    </Sider>
  );
};
