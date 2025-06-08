import React, { useState, useRef, useEffect } from "react";
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
  Grid,
  Flex,
  theme,
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
const { useBreakpoint } = Grid;
const { useToken } = theme;

export const ChatSidebar: React.FC<{
  themeMode: "light" | "dark";
  onThemeModeChange: (mode: "light" | "dark") => void;
}> = ({ themeMode, onThemeModeChange }) => {
  const { token } = useToken();
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
  const [footerHeight, setFooterHeight] = useState(0);
  const footerRef = useRef<HTMLDivElement>(null);
  const screens = useBreakpoint();

  // 动态计算底部按钮区高度
  useEffect(() => {
    function updateFooterHeight() {
      if (footerRef.current) {
        setFooterHeight(footerRef.current.offsetHeight);
      }
    }
    updateFooterHeight();
    window.addEventListener("resize", updateFooterHeight);
    return () => window.removeEventListener("resize", updateFooterHeight);
  }, []);

  // 响应式折叠逻辑
  useEffect(() => {
    if (screens.xs === false && screens.sm === false) {
      // 小屏幕自动折叠
      setCollapsed(true);
    }
  }, [screens]);

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

  const handleEditTitle = (chatId: string, newTitle: string) => {
    updateChat(chatId, { title: newTitle });
  };

  // 响应式宽度计算
  const getSiderWidth = () => {
    if (screens.xxl) return 300;
    if (screens.xl) return 280;
    if (screens.lg) return 260;
    if (screens.md) return 240;
    return 220;
  };

  return (
    <Sider
      breakpoint="md"
      collapsedWidth={0}
      width={getSiderWidth()}
      collapsible
      collapsed={collapsed}
      onCollapse={(value) => setCollapsed(value)}
      trigger={null}
      style={{
        background: "var(--ant-color-bg-container)",
        borderRight: "1px solid var(--ant-color-border)",
        position: "relative",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {/* 折叠/展开按钮 */}
      <Flex
        justify="flex-end"
        style={{
          position: "absolute",
          right: collapsed ? "50%" : 8,
          top: 8,
          transform: collapsed ? "translateX(50%)" : "none",
          zIndex: 10,
        }}
      >
        <Button
          type="text"
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={() => setCollapsed(!collapsed)}
          size={screens.xs ? "small" : "middle"}
        />
      </Flex>

      {/* 聊天列表区域 */}
      <Flex
        vertical
        style={{
          height: `calc(100vh - ${footerHeight}px)`,
          overflowY: "auto",
          padding: "40px 8px 0 8px",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
        className="chat-sidebar-scroll"
      >
        <style>{`
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
            background-color: var(--ant-color-primary-bg);
          }
          [data-theme='light'] .chat-item-collapsed.selected {
            background-color: var(--ant-color-primary-bg);
          }
        `}</style>

        {!collapsed ? (
          <Space direction="vertical" size="small" style={{ width: "100%" }}>
            {Object.entries(groupedChats).map(([date, chatsInGroup], idx) => (
              <div key={date}>
                {idx > 0 && (
                  <Divider style={{ margin: `${token.marginXS}px 0` }} />
                )}
                <Text
                  type="secondary"
                  style={{
                    fontSize: 12,
                    margin: "8px 0",
                    display: "block",
                    paddingLeft: 8,
                  }}
                >
                  {date}
                </Text>
                <List
                  itemLayout="horizontal"
                  dataSource={chatsInGroup}
                  split={false}
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
          </Space>
        ) : (
          <Space direction="vertical" size="small" style={{ width: "100%" }}>
            {Object.values(groupedChats)
              .flat()
              .map((chat) => (
                <Tooltip key={chat.id} placement="right" title={chat.title}>
                  <Flex
                    justify="center"
                    align="center"
                    className={`chat-item-collapsed ${
                      chat.id === currentChatId ? "selected" : ""
                    }`}
                    onClick={() => selectChat(chat.id)}
                  >
                    <Avatar
                      size={screens.xs ? "small" : "default"}
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
                  </Flex>
                </Tooltip>
              ))}
          </Space>
        )}
      </Flex>

      {/* 底部操作区 */}
      <Flex
        ref={footerRef}
        vertical
        gap="middle"
        style={{
          padding: collapsed ? 16 : 16,
          background: "var(--ant-color-bg-container)",
          borderTop: "1px solid var(--ant-color-border)",
        }}
      >
        <Tooltip placement={collapsed ? "right" : "top"} title="New Chat">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              const newChatId = addChat();
              selectChat(newChatId);
            }}
            block
            size={screens.xs ? "small" : "middle"}
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
            size={screens.xs ? "small" : "middle"}
          >
            {!collapsed && (isSelectMode ? "Exit Select Mode" : "Select Mode")}
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
            size={screens.xs ? "small" : "middle"}
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
            size={screens.xs ? "small" : "middle"}
          >
            Delete selected chats
          </Button>
        )}
      </Flex>

      <SystemSettingsModal
        open={isSettingsModalOpen}
        onClose={handleCloseSettings}
        themeMode={themeMode}
        onThemeModeChange={onThemeModeChange}
      />
    </Sider>
  );
};
