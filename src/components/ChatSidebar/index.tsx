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
  Avatar,
} from "antd";
import {
  PlusOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MessageOutlined,
} from "@ant-design/icons";
import { useChat } from "../../contexts/ChatContext";
import { groupChatsByDate } from "../../utils/chatUtils";
import { SystemSettingsModal } from "../SystemSettingsModal";
import { ChatItem } from "../ChatItem";

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
    deleteChats,
    pinChat,
    unpinChat,
    updateChat,
  } = useChat();
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedChatIds, setSelectedChatIds] = useState<string[]>([]);

  // For debugging
  console.log("ChatSidebar rendered with chats:", chats);

  // Group chats by date
  const groupedChats = groupChatsByDate(chats);

  // For debugging grouped chats
  console.log("Grouped chats:", groupedChats);

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

  const handleEditTitle = (chatId: string, newTitle: string) => {
    updateChat(chatId, { title: newTitle });
  };

  return (
    <Sider
      width={300}
      collapsible
      collapsed={collapsed}
      onCollapse={(value) => setCollapsed(value)}
      trigger={null}
      collapsedWidth={80}
      style={{
        paddingTop: 8,
        background: "var(--ant-color-bg-container)",
        borderRight: "1px solid var(--ant-color-border)",
      }}
    >
      <Button
        type="text"
        icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        onClick={() => setCollapsed(!collapsed)}
        style={{
          position: "absolute",
          right: collapsed ? "50%" : 8,
          top: 8,
          transform: collapsed ? "translateX(50%)" : "none",
          zIndex: 1,
        }}
      />
      <div
        style={{
          height: "calc(100vh - 120px)",
          overflowY: "auto",
          padding: "0 8px",
          marginTop: 24,
          /* Hide scrollbar for Webkit browsers */
          scrollbarWidth: "none" /* Firefox */,
          msOverflowStyle: "none" /* IE and Edge */,
        }}
      >
        <style>{`
          /* Hide scrollbar for Chrome, Safari and Opera */
          .chat-sidebar-scroll::-webkit-scrollbar {
            display: none;
          }
          .chat-item-collapsed {
            padding: 8px 0;
            margin: 10px 0;
            text-align: center;
            cursor: pointer;
            border-radius: 6px;
            transition: all 0.3s;
            display: flex;
            justify-content: center;
            align-items: center;
          }
          .chat-item-collapsed:hover {
            background: var(--ant-color-bg-elevated);
          }
          [data-theme='dark'] .chat-item-collapsed.selected {
            background-color: #2b2b2b;
          }
          [data-theme='light'] .chat-item-collapsed.selected {
            background-color: #aaaaaa;
          }
        `}</style>
        <div className="chat-sidebar-scroll" style={{ height: "100%" }}>
          {!collapsed &&
            Object.entries(groupedChats).map(([date, chatsInGroup], idx) => (
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
                    <ChatItem
                      key={chat.id}
                      chat={chat}
                      isSelected={chat.id === currentChatId}
                      onSelect={(chatId) => selectChat(chatId)}
                      onDelete={handleDelete}
                      onPin={pinChat}
                      onUnpin={unpinChat}
                      onEdit={handleEditTitle}
                      SelectMode={isSelectMode}
                      checked={selectedChatIds.includes(chat.id)}
                      onCheck={(chatId, checked) => {
                        setSelectedChatIds((prev) =>
                          checked
                            ? [...prev, chatId]
                            : prev.filter((id) => id !== chatId)
                        );
                      }}
                    />
                  )}
                />
              </div>
            ))}
          {collapsed && (
            <List
              itemLayout="horizontal"
              dataSource={Object.values(groupedChats).flat()}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                padding: "0 8px",
              }}
              renderItem={(chat) => (
                <Tooltip placement="right" title={chat.title}>
                  <div
                    className={`chat-item-collapsed ${
                      chat.id === currentChatId ? "selected" : ""
                    }`}
                    onClick={() => selectChat(chat.id)}
                  >
                    <Avatar
                      style={{
                        backgroundColor:
                          chat.id === currentChatId
                            ? "var(--ant-color-primary)"
                            : "var(--ant-color-bg-container)",
                        color:
                          chat.id === currentChatId
                            ? "#fff"
                            : "var(--ant-color-text)",
                      }}
                      icon={<MessageOutlined />}
                    >
                      {chat.title.charAt(0).toUpperCase()}
                    </Avatar>
                  </div>
                </Tooltip>
              )}
            />
          )}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: collapsed ? "16px 8px" : 16,
          background: "var(--ant-color-bg-container)",
          borderTop: "1px solid var(--ant-color-border)",
        }}
      >
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <Tooltip placement={collapsed ? "right" : "top"} title="New Chat">
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                const newChatId = addChat();
                selectChat(newChatId);
              }}
              block
            >
              {!collapsed && "New Chat"}
            </Button>
          </Tooltip>
          <Tooltip
            placement={collapsed ? "right" : "top"}
            title={isSelectMode ? "Exit Select Mode" : "Select Mode"}
          >
            <Button
              type={isSelectMode ? "default" : "dashed"}
              onClick={() => {
                setIsSelectMode(!isSelectMode);
                setSelectedChatIds([]);
              }}
              block
            >
              {!collapsed &&
                (isSelectMode ? "Exit Select Mode" : "Select Mode")}
            </Button>
          </Tooltip>
          <Tooltip
            placement={collapsed ? "right" : "top"}
            title="System Settings"
          >
            <Button
              icon={<SettingOutlined />}
              onClick={handleOpenSettings}
              block
            >
              {!collapsed && "System Settings"}
            </Button>
          </Tooltip>
          {isSelectMode && (
            <Button
              danger
              type="primary"
              disabled={selectedChatIds.length === 0}
              onClick={() => {
                Modal.confirm({
                  title: `Delete selected chats`,
                  content: `Are you sure you want to delete the selected ${selectedChatIds.length} chats? This action cannot be undone.`,
                  okText: "Delete",
                  okType: "danger",
                  cancelText: "Cancel",
                  onOk: () => {
                    deleteChats(selectedChatIds);
                    setSelectedChatIds([]);
                    setIsSelectMode(false);
                  },
                });
              }}
              block
            >
              Delete selected chats
            </Button>
          )}
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
