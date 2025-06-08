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
      collapsedWidth={60}
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
        justify={collapsed ? "center" : "flex-end"}
        style={{
          position: "absolute",
          right: collapsed ? 0 : 8,
          left: collapsed ? 0 : "auto",
          top: 8,
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
          padding: collapsed ? "40px 4px 0 4px" : "40px 8px 0 8px",
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
            padding: 6px 4px;
            margin: 4px 0;
            text-align: center;
            cursor: pointer;
            border-radius: 8px;
            transition: all 0.3s;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 40px;
          }
          .chat-item-collapsed:hover {
            background: var(--ant-color-bg-elevated);
          }
          [data-theme='dark'] .chat-item-collapsed.selected {
            background-color: rgba(22, 104, 220, 0.1);
            border: 1px solid #1668dc;
          }
          [data-theme='light'] .chat-item-collapsed.selected {
            background-color: rgba(22, 119, 255, 0.08);
            border: 1px solid #1677ff;
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
                      size={screens.xs ? 32 : 36}
                      style={{
                        backgroundColor:
                          chat.id === currentChatId
                            ? themeMode === "light"
                              ? "#1677ff"
                              : "#1668dc"
                            : themeMode === "light"
                            ? "#f5f5f5"
                            : "var(--ant-color-fill-quaternary)",
                        color:
                          chat.id === currentChatId
                            ? "#fff"
                            : themeMode === "light"
                            ? "#595959"
                            : "var(--ant-color-text)",
                        border:
                          chat.id === currentChatId
                            ? themeMode === "light"
                              ? "2px solid #1677ff"
                              : "2px solid #1668dc"
                            : themeMode === "light"
                            ? "1px solid #d9d9d9"
                            : "1px solid var(--ant-color-border)",
                        fontSize: screens.xs ? "14px" : "16px",
                        fontWeight: "500",
                        boxShadow:
                          chat.id === currentChatId
                            ? "0 2px 8px rgba(22, 119, 255, 0.15)"
                            : "none",
                      }}
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
        gap={collapsed ? "small" : "middle"}
        style={{
          padding: collapsed ? 8 : 16,
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
            block={!collapsed}
            shape={collapsed ? "circle" : "default"}
            size={collapsed ? "large" : screens.xs ? "small" : "middle"}
            style={
              collapsed
                ? { width: "44px", height: "44px", margin: "0 auto" }
                : {}
            }
          >
            {!collapsed && "New Chat"}
          </Button>
        </Tooltip>

        {!collapsed && (
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
              {isSelectMode ? "Exit Select Mode" : "Select Mode"}
            </Button>
          </Tooltip>
        )}

        <Tooltip
          placement={collapsed ? "right" : "top"}
          title="System Settings"
        >
          <Button
            icon={<SettingOutlined />}
            onClick={handleOpenSettings}
            block={!collapsed}
            shape={collapsed ? "circle" : "default"}
            size={collapsed ? "large" : screens.xs ? "small" : "middle"}
            style={
              collapsed
                ? { width: "44px", height: "44px", margin: "0 auto" }
                : {}
            }
          >
            {!collapsed && "System Settings"}
          </Button>
        </Tooltip>

        {isSelectMode && !collapsed && (
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
