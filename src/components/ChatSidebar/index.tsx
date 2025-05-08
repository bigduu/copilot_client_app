import React, { useState } from "react";
import {
  Layout,
  Button,
  Modal,
  List,
  Typography,
  Divider,
  Space,
  Tooltip,
} from "antd";
import {
  PlusOutlined,
  SettingOutlined,
  PushpinFilled,
  PushpinOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { useChat } from "../../contexts/ChatContext";
import { groupChatsByDate } from "../../utils/chatUtils";
import { SystemSettingsModal } from "../SystemSettingsModal";

const { Sider } = Layout;
const { Text } = Typography;

export const ChatSidebar: React.FC<{
  themeMode: "light" | "dark";
  onThemeModeChange: (mode: "light" | "dark") => void;
}> = ({ themeMode, onThemeModeChange }) => {
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
    <Sider
      width={250}
      style={{
        paddingTop: 16,
        background: "var(--ant-color-bg-container)",
        borderRight: "1px solid var(--ant-color-border)",
      }}
    >
      <div
        style={{
          height: "calc(100vh - 120px)",
          overflowY: "auto",
          padding: "0 8px",
        }}
      >
        {Object.entries(groupedChats).map(([date, chatsInGroup], idx) => (
          <div key={date}>
            {idx > 0 && <Divider style={{ margin: "8px 0" }} />}
            <Text
              type="secondary"
              style={{ fontSize: 12, margin: "8px 0", display: "block" }}
            >
              {date}
            </Text>
            <List
              itemLayout="horizontal"
              dataSource={chatsInGroup}
              renderItem={(chat) => (
                <List.Item
                  style={{
                    background:
                      chat.id === currentChatId
                        ? "var(--ant-color-primary-bg)"
                        : undefined,
                    borderRadius: 6,
                    marginBottom: 4,
                    cursor: "pointer",
                    padding: 8,
                    border:
                      chat.id === currentChatId
                        ? `1px solid var(--ant-color-primary-border)`
                        : "1px solid transparent",
                    transition: "background 0.2s",
                  }}
                  onClick={() => selectChat(chat.id)}
                  actions={[
                    <Tooltip title={chat.pinned ? "Unpin" : "Pin"} key="pin">
                      <Button
                        type="text"
                        size="small"
                        icon={
                          chat.pinned ? (
                            <PushpinFilled style={{ color: "#faad14" }} />
                          ) : (
                            <PushpinOutlined />
                          )
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          chat.pinned ? unpinChat(chat.id) : pinChat(chat.id);
                        }}
                        style={{ marginRight: 4 }}
                      />
                    </Tooltip>,
                    <Tooltip title="Delete" key="delete">
                      <Button
                        type="text"
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(chat.id);
                        }}
                      />
                    </Tooltip>,
                  ]}
                >
                  <Tooltip title={chat.title} placement="right">
                    <div
                      style={{
                        flex: 1,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        fontWeight: chat.id === currentChatId ? 600 : 400,
                        color:
                          chat.id === currentChatId
                            ? "var(--ant-color-primary)"
                            : "var(--ant-color-text)",
                      }}
                    >
                      {chat.title}
                    </div>
                  </Tooltip>
                </List.Item>
              )}
            />
          </div>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: 16,
          background: "var(--ant-color-bg-container)",
          borderTop: "1px solid var(--ant-color-border)",
        }}
      >
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              const newChatId = addChat();
              selectChat(newChatId);
            }}
            block
          >
            New Chat
          </Button>
          <Button icon={<SettingOutlined />} onClick={handleOpenSettings} block>
            System Settings
          </Button>
        </Space>
      </div>
      <SystemSettingsModal
        open={isSettingsModalOpen}
        onClose={handleCloseSettings}
        themeMode={themeMode}
        onThemeModeChange={onThemeModeChange}
      />
    </Sider>
  );
};
