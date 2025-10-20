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
  DownOutlined,
  RightOutlined,
  DeleteOutlined,
  CalendarOutlined,
} from "@ant-design/icons";
import { useAppStore } from "../../store";
import {
  groupChatsByDate,
  getSortedDateKeys,
  getChatIdsByDate,
  getChatCountByDate,
} from "../../utils/chatUtils";
import { SystemSettingsModal } from "../SystemSettingsModal";
import { ChatItem as ChatItemComponent } from "../ChatItem";
import { ChatItem } from "../../types/chat";
import SystemPromptSelector from "../SystemPromptSelector";
import { UserSystemPrompt } from "../../types/chat";
import { useChatController } from "../../contexts/ChatControllerContext";

const { Sider } = Layout;
const { Text } = Typography;
const { useBreakpoint } = Grid;
const { useToken } = theme;

export const ChatSidebar: React.FC<{
  themeMode: "light" | "dark";
  onThemeModeChange: (mode: "light" | "dark") => void;
}> = ({ themeMode, onThemeModeChange }) => {
  const { token } = useToken();
  // Use the central chat manager hook
  const {
    chats,
    currentChatId,
    selectChat,
    deleteChat,
    deleteChats,
    pinChat,
    unpinChat,
    updateChat,
    createNewChat,
  } = useChatController();

  const systemPrompts = useAppStore((state) => state.systemPrompts);
  const loadSystemPrompts = useAppStore((state) => state.loadSystemPrompts);

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isNewChatSelectorOpen, setIsNewChatSelectorOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [footerHeight, setFooterHeight] = useState(0);

  // Collapse/expand state management
  const [expandedDates, setExpandedDates] = useState<Set<string>>(
    new Set(["Today"]) // Expand Today by default
  );
  const footerRef = useRef<HTMLDivElement>(null);
  const screens = useBreakpoint();

  // Collapse/expand helper functions
  const toggleDateExpansion = (dateKey: string) => {
    setExpandedDates((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(dateKey)) {
        newSet.delete(dateKey);
      } else {
        newSet.add(dateKey);
      }
      return newSet;
    });
  };

  const isDateExpanded = (dateKey: string): boolean => {
    return expandedDates.has(dateKey);
  };

  // Load system prompt presets on component mount
  useEffect(() => {
    loadSystemPrompts();
  }, [loadSystemPrompts]);

  // Dynamically calculate footer button area height
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

  // Responsive collapse logic
  useEffect(() => {
    if (screens.xs === false && screens.sm === false) {
      // Auto collapse on small screens
      setCollapsed(true);
    }
  }, [screens]);

  // Group chats by date
  const groupedChatsByDate = groupChatsByDate(chats);
  const sortedDateKeys = getSortedDateKeys(groupedChatsByDate);

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

  const handleGenerateTitle = async () => {
    // This feature is temporarily disabled during refactoring.
    // A new implementation will be added if required.
    console.warn("AI title generation is temporarily disabled.");
  };

  // Batch delete handler
  const handleDeleteByDate = (dateKey: string) => {
    const chatIds = getChatIdsByDate(groupedChatsByDate, dateKey);
    const chatCount = getChatCountByDate(groupedChatsByDate, dateKey);

    Modal.confirm({
      title: `Delete all chats from ${dateKey}`,
      content: `Are you sure you want to delete all ${chatCount} chats from ${dateKey}? This action cannot be undone.`,
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      onOk: () => {
        deleteChats(chatIds);
      },
    });
  };

  const handleNewChat = () => {
    setIsNewChatSelectorOpen(true);
  };

  const handleNewChatSelectorClose = () => {
    setIsNewChatSelectorOpen(false);
  };

  const handleSystemPromptSelect = (preset: UserSystemPrompt) => {
    try {
      createNewChat(`New Chat - ${preset.name}`, {
        config: {
          systemPromptId: preset.id,
          toolCategory: "general", // Category is deprecated, using a default value
          lastUsedEnhancedPrompt: null,
        },
      });
      setIsNewChatSelectorOpen(false);
    } catch (error) {
      console.error("Failed to create chat:", error);
      Modal.error({
        title: "Failed to Create Chat",
        content:
          error instanceof Error
            ? error.message
            : "Unknown error, please try again",
      });
    }
  };

  // Responsive width calculation
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
      {/* Collapse/expand button */}
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

      {/* Chat list area */}
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

          /* Date and Category Group Styles */
          .date-group-header:hover .date-delete-btn {
            opacity: 0.6 !important;
          }
          .date-group-header .date-delete-btn {
            opacity: 0 !important;
            transition: opacity 0.2s;
          }
          .date-group-header:hover .date-delete-btn {
            opacity: 0.6 !important;
          }
          .date-delete-btn:hover {
            opacity: 1 !important;
            color: var(--ant-color-error) !important;
          }

          .category-group-header:hover .category-delete-btn {
            opacity: 0.5 !important;
          }
          .category-group-header .category-delete-btn {
            opacity: 0 !important;
            transition: opacity 0.2s;
          }
          .category-group-header:hover .category-delete-btn {
            opacity: 0.5 !important;
          }
          .category-delete-btn:hover {
            opacity: 1 !important;
            color: var(--ant-color-error) !important;
          }

          /* Smooth expand/collapse animations */
          .date-group-content {
            overflow: hidden;
            transition: max-height 0.3s ease-in-out, opacity 0.2s ease-in-out;
          }
          .category-group-content {
            overflow: hidden;
            transition: max-height 0.2s ease-in-out, opacity 0.15s ease-in-out;
          }

          /* Empty state styles */
          .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: var(--ant-color-text-tertiary);
          }
          .empty-state .empty-icon {
            font-size: 48px;
            margin-bottom: 16px;
            opacity: 0.5;
          }
        `}</style>

        {!collapsed ? (
          <Space direction="vertical" size="small" style={{ width: "100%" }}>
            {sortedDateKeys.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">💬</div>
                <Text type="secondary">No chats yet</Text>
                <br />
                <Text
                  type="secondary"
                  style={{ fontSize: "12px", opacity: 0.7 }}
                >
                  Click "New Chat" to get started
                </Text>
              </div>
            ) : (
              sortedDateKeys.map((dateKey, dateIdx) => {
                const dateGroup = groupedChatsByDate[dateKey];
                const isDateOpen = isDateExpanded(dateKey);
                const totalChatsInDate = getChatCountByDate(
                  groupedChatsByDate,
                  dateKey
                );

                return (
                  <div key={dateKey}>
                    {dateIdx > 0 && (
                      <Divider style={{ margin: `${token.marginXS}px 0` }} />
                    )}

                    {/* Date Group Header */}
                    <Flex
                      align="center"
                      justify="space-between"
                      style={{
                        padding: "8px",
                        cursor: "pointer",
                        borderRadius: "6px",
                        transition: "background-color 0.2s",
                        backgroundColor: isDateOpen
                          ? token.colorFill
                          : "transparent",
                      }}
                      onClick={() => toggleDateExpansion(dateKey)}
                      className="date-group-header"
                    >
                      <Flex align="center" gap="small">
                        {isDateOpen ? <DownOutlined /> : <RightOutlined />}
                        <CalendarOutlined />
                        <Text
                          strong
                          style={{
                            fontSize: 14,
                            color:
                              dateKey === "Today"
                                ? token.colorPrimary
                                : themeMode === "light"
                                ? "#000000"
                                : "inherit",
                          }}
                        >
                          {dateKey} ({totalChatsInDate})
                        </Text>
                      </Flex>

                      {/* Date Group Delete Button */}
                      <Button
                        type="text"
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteByDate(dateKey);
                        }}
                        style={{ opacity: 0.6 }}
                        className="date-delete-btn"
                      />
                    </Flex>

                    {/* Chat Items within this date */}
                    {isDateOpen && (
                      <List
                        itemLayout="horizontal"
                        dataSource={dateGroup}
                        split={false}
                        style={{ marginTop: "4px", marginLeft: "16px" }}
                        renderItem={(chat: ChatItem) => (
                          <ChatItemComponent
                            key={chat.id}
                            chat={chat}
                            isSelected={chat.id === currentChatId}
                            onSelect={(chatId) => selectChat(chatId)}
                            onDelete={handleDelete}
                            onPin={pinChat}
                            onUnpin={unpinChat}
                            onEdit={handleEditTitle}
                            onGenerateTitle={handleGenerateTitle}
                          />
                        )}
                      />
                    )}
                  </div>
                );
              })
            )}
          </Space>
        ) : (
          <Space direction="vertical" size="small" style={{ width: "100%" }}>
            {chats.map((chat: ChatItem) => (
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
                          ? token.colorPrimary
                          : "transparent",
                      color:
                        chat.id === currentChatId
                          ? token.colorTextLightSolid
                          : token.colorText,
                    }}
                  >
                    {chat.title.charAt(0)}
                  </Avatar>
                </Flex>
              </Tooltip>
            ))}
          </Space>
        )}
      </Flex>

      {/* Bottom action area */}
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
            onClick={handleNewChat}
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
      </Flex>

      <SystemSettingsModal
        open={isSettingsModalOpen}
        onClose={handleCloseSettings}
        themeMode={themeMode}
        onThemeModeChange={onThemeModeChange}
      />

      <SystemPromptSelector
        open={isNewChatSelectorOpen}
        onClose={handleNewChatSelectorClose}
        onSelect={handleSystemPromptSelect}
        prompts={systemPrompts}
        title="Create New Chat - Select System Prompt"
        showCancelButton={true}
      />
    </Sider>
  );
};
