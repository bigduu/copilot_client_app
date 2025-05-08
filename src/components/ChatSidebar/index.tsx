import React, { useState } from "react";
import { Layout, Button, Modal } from "antd";
import { PlusOutlined, SettingOutlined } from "@ant-design/icons";
import { useChat } from "../../contexts/ChatContext";
import { groupChatsByDate } from "../../utils/chatUtils";
import { ChatItem as ChatItemComponent } from "../ChatItem";
import { SystemSettingsModal } from "../SystemSettingsModal";

import "./styles.css";

const { Sider } = Layout;

export const ChatSidebar: React.FC = () => {
  const {
    chats,
    addChat,
    selectChat,
    currentChatId,
    deleteChat,
    pinChat,
    unpinChat,
  } = useChat();
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

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

  const handleOpenSettings = () => {
    setIsSettingsModalOpen(true);
  };

  const handleCloseSettings = () => {
    setIsSettingsModalOpen(false);
  };

  return (
    <Sider className="chat-sidebar" width={250} style={{ paddingTop: 16 }}>
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
                onPin={pinChat}
                onUnpin={unpinChat}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="sidebar-footer">
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
        <Button
          icon={<SettingOutlined />}
          onClick={handleOpenSettings}
          className="system-settings-button"
          block
        >
          System Settings
        </Button>
      </div>
      <SystemSettingsModal
        open={isSettingsModalOpen}
        onClose={handleCloseSettings}
      />
    </Sider>
  );
};
