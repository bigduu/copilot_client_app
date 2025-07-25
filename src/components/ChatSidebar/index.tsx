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
import { useChatStore } from "../../store/chatStore";
import {
  groupChatsByToolCategory,
  getCategoryDisplayInfoAsync,
} from "../../utils/chatUtils";
import { SystemSettingsModal } from "../SystemSettingsModal";
import { ChatItem as ChatItemComponent } from "../ChatItem";
import { ChatItem } from "../../types/chat";
import SystemPromptSelector from "../SystemPromptSelector";
import { SystemPromptPreset } from "../../types/chat";
import { useMessages } from "../../hooks/useMessages";

const { Sider } = Layout;
const { Text } = Typography;
const { useBreakpoint } = Grid;
const { useToken } = theme;

export const ChatSidebar: React.FC<{
  themeMode: "light" | "dark";
  onThemeModeChange: (mode: "light" | "dark") => void;
}> = ({ themeMode, onThemeModeChange }) => {
  const { token } = useToken();
  // Direct access to Zustand store - much simpler!
  const chats = useChatStore((state) => state.chats);
  const addChat = useChatStore((state) => state.addChat);
  const selectChat = useChatStore((state) => state.selectChat);
  const currentChatId = useChatStore((state) => state.currentChatId);
  const deleteChat = useChatStore((state) => state.deleteChat);
  const deleteChats = useChatStore((state) => state.deleteChats);
  const pinChat = useChatStore((state) => state.pinChat);
  const unpinChat = useChatStore((state) => state.unpinChat);
  const updateChat = useChatStore((state) => state.updateChat);
  const systemPromptPresets = useChatStore(
    (state) => state.systemPromptPresets
  );

  const loadSystemPromptPresets = useChatStore(
    (state) => state.loadSystemPromptPresets
  );

  // Add useMessages hook for AI title generation
  const { generateChatTitle } = useMessages();
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isNewChatSelectorOpen, setIsNewChatSelectorOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedChatIds, setSelectedChatIds] = useState<string[]>([]);
  const [footerHeight, setFooterHeight] = useState(0);
  // 添加类别信息缓存和loading状态
  const [categoryInfoCache, setCategoryInfoCache] = useState<
    Record<string, any>
  >({});
  const [loadingCategories, setLoadingCategories] = useState<Set<string>>(
    new Set()
  );
  const footerRef = useRef<HTMLDivElement>(null);
  const screens = useBreakpoint();

  // 异步获取类别信息的辅助函数
  const getCategoryInfo = async (category: string) => {
    // 如果已经在缓存中，直接返回
    if (categoryInfoCache[category]) {
      return categoryInfoCache[category];
    }

    // 如果正在加载，返回默认值
    if (loadingCategories.has(category)) {
      return {
        name: category,
        icon: "🔧",
        description: "Loading...",
        color: "#666666",
      };
    }

    try {
      // 标记为加载中
      setLoadingCategories((prev) => new Set(prev).add(category));

      // 获取类别信息
      const categoryInfo = await getCategoryDisplayInfoAsync(category);

      // 存储到缓存
      setCategoryInfoCache((prev) => ({
        ...prev,
        [category]: categoryInfo,
      }));

      return categoryInfo;
    } catch (error) {
      console.error(`获取类别 ${category} 信息失败:`, error);
      // 返回默认信息
      const defaultInfo = {
        name: category,
        icon: "❌",
        description: "Failed to load category info",
        color: "#ff4d4f",
      };

      // 即使失败也要存储默认信息到缓存
      setCategoryInfoCache((prev) => ({
        ...prev,
        [category]: defaultInfo,
      }));

      return defaultInfo;
    } finally {
      // 移除加载标记
      setLoadingCategories((prev) => {
        const newSet = new Set(prev);
        newSet.delete(category);
        return newSet;
      });
    }
  };

  // 简单的分组排序函数（避免使用硬编码的权重）
  const sortGroupedChats = (
    grouped: Record<string, ChatItem[]>
  ): Record<string, ChatItem[]> => {
    // 将 Pinned 放在最前面，其他按字母顺序排序
    const sortedEntries = Object.entries(grouped).sort(
      ([categoryA], [categoryB]) => {
        if (categoryA === "Pinned") return -1;
        if (categoryB === "Pinned") return 1;
        return categoryA.localeCompare(categoryB);
      }
    );
    return Object.fromEntries(sortedEntries);
  };

  // Load system prompt presets on component mount
  useEffect(() => {
    loadSystemPromptPresets();
  }, [loadSystemPromptPresets]);

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

  // Group chats by tool category
  const groupedChats = sortGroupedChats(groupChatsByToolCategory(chats));

  // 预加载所有类别信息
  useEffect(() => {
    const loadCategoryInfo = async () => {
      const categories = Object.keys(groupedChats);
      for (const category of categories) {
        if (!categoryInfoCache[category] && !loadingCategories.has(category)) {
          try {
            await getCategoryInfo(category);
          } catch (error) {
            console.error(`预加载类别 ${category} 信息失败:`, error);
          }
        }
      }
    };

    if (Object.keys(groupedChats).length > 0) {
      loadCategoryInfo();
    }
  }, [chats]); // 监听 chats 变化而不是 groupedChats

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

  const handleGenerateTitle = async (chatId: string) => {
    try {
      console.log(`[ChatSidebar] Generating AI title for chat: ${chatId}`);
      const newTitle = await generateChatTitle(chatId);
      updateChat(chatId, { title: newTitle });
      console.log(`[ChatSidebar] Generated title: "${newTitle}"`);
    } catch (error) {
      console.error("Failed to generate title:", error);
    }
  };

  const handleNewChat = () => {
    setIsNewChatSelectorOpen(true);
  };

  const handleNewChatSelectorClose = () => {
    setIsNewChatSelectorOpen(false);
  };

  const handleSystemPromptSelect = (preset: SystemPromptPreset) => {
    try {
      // Create new chat and apply selected System Prompt settings
      addChat({
        title: `New Chat - ${preset.name}`,
        messages: [],
        createdAt: Date.now(),
        systemPromptId: preset.id,
        toolCategory: preset.category,
        systemPrompt: preset.content,
      });

      // The new chat is automatically selected in the store

      // Close the selector
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
        `}</style>

        {!collapsed ? (
          <Space direction="vertical" size="small" style={{ width: "100%" }}>
            {Object.entries(groupedChats).map(
              ([category, chatsInGroup], idx) => {
                const categoryInfo = categoryInfoCache[category] || {
                  name: category,
                  icon: "🔧",
                  description: "Loading...",
                  color: "#666666",
                };
                return (
                  <div key={category}>
                    {idx > 0 && (
                      <Divider style={{ margin: `${token.marginXS}px 0` }} />
                    )}
                    <Text
                      type="secondary"
                      style={{
                        fontSize: 12,
                        margin: "8px 0",
                        display: "flex",
                        alignItems: "center",
                        paddingLeft: 8,
                        color: categoryInfo.color,
                        fontWeight: 500,
                      }}
                    >
                      <span style={{ marginRight: 6 }}>
                        {categoryInfo.icon}
                      </span>
                      {categoryInfo.name}
                    </Text>
                    <List
                      itemLayout="horizontal"
                      dataSource={chatsInGroup}
                      split={false}
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
                );
              }
            )}
          </Space>
        ) : (
          <Space direction="vertical" size="small" style={{ width: "100%" }}>
            {Object.values(groupedChats)
              .flat()
              .map((chat: ChatItem) => {
                const category = chat.toolCategory || "unknown";
                const categoryInfo = categoryInfoCache[category] || {
                  name: category,
                  icon: "🔧",
                  description: "Loading...",
                  color: "#666666",
                };
                return (
                  <Tooltip
                    key={chat.id}
                    placement="right"
                    title={
                      <div>
                        <div style={{ fontWeight: 500, marginBottom: "4px" }}>
                          {chat.title}
                        </div>
                        <div
                          style={{
                            fontSize: "11px",
                            opacity: 0.9,
                            color: categoryInfo.color,
                            marginBottom: "2px",
                          }}
                        >
                          {categoryInfo.icon} {categoryInfo.name}
                        </div>
                        <div
                          style={{
                            fontSize: "10px",
                            opacity: 0.7,
                            fontStyle: "italic",
                          }}
                        >
                          {categoryInfo.description}
                        </div>
                      </div>
                    }
                  >
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
                              ? categoryInfo.color ||
                                (themeMode === "light" ? "#1677ff" : "#1668dc")
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
                              ? `2px solid ${
                                  categoryInfo.color ||
                                  (themeMode === "light"
                                    ? "#1677ff"
                                    : "#1668dc")
                                }`
                              : themeMode === "light"
                              ? "1px solid #d9d9d9"
                              : "1px solid var(--ant-color-border)",
                          fontSize: screens.xs ? "14px" : "16px",
                          fontWeight: "500",
                          boxShadow:
                            chat.id === currentChatId
                              ? `0 2px 8px ${
                                  categoryInfo.color
                                    ? categoryInfo.color + "30"
                                    : "rgba(22, 119, 255, 0.15)"
                                }`
                              : "none",
                        }}
                      >
                        {categoryInfo.icon}
                      </Avatar>
                    </Flex>
                  </Tooltip>
                );
              })}
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

      <SystemPromptSelector
        open={isNewChatSelectorOpen}
        onClose={handleNewChatSelectorClose}
        onSelect={handleSystemPromptSelect}
        presets={systemPromptPresets}
        title="Create New Chat - Select System Prompt"
        showCancelButton={true}
      />
    </Sider>
  );
};
