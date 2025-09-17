import React, { useState, useRef, useEffect, useCallback } from "react";
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
  groupChatsByToolCategory,
  groupChatsByDateAndCategory,
  getSortedDateKeys,
  getCategoryDisplayInfoAsync,
  getChatIdsByDate,
  getChatIdsByDateAndCategory,
  getChatCountByDate,
} from "../../utils/chatUtils";
import { SystemSettingsModal } from "../SystemSettingsModal";
import { ChatItem as ChatItemComponent } from "../ChatItem";
import { ChatItem } from "../../types/chat";
import SystemPromptSelector from "../SystemPromptSelector";
import { SystemPromptPreset } from "../../types/chat";
import { useChatController } from "../../hooks/useChatController";

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
  const chats = useAppStore((state) => state.chats);
  const addChat = useAppStore((state) => state.addChat);
  const selectChat = useAppStore((state) => state.selectChat);
  const currentChatId = useAppStore((state) => state.currentChatId);
  const deleteChat = useAppStore((state) => state.deleteChat);
  const deleteChats = useAppStore((state) => state.deleteChats);
  const pinChat = useAppStore((state) => state.pinChat);
  const unpinChat = useAppStore((state) => state.unpinChat);
  const updateChat = useAppStore((state) => state.updateChat);
  const systemPromptPresets = useAppStore((state) => state.systemPromptPresets);

  const loadSystemPromptPresets = useAppStore(
    (state) => state.loadSystemPromptPresets
  );

  // Add useChatController hook for AI title generation
  const { generateChatTitle } = useChatController();
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isNewChatSelectorOpen, setIsNewChatSelectorOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [footerHeight, setFooterHeight] = useState(0);

  // Add category info cache and loading state
  const [categoryInfoCache, setCategoryInfoCache] = useState<
    Record<string, any>
  >({});
  const [loadingCategories, setLoadingCategories] = useState<Set<string>>(
    new Set()
  );

  // Collapse/expand state management
  const [expandedDates, setExpandedDates] = useState<Set<string>>(
    new Set(["Today"]) // Expand Today by default
  );
  const [expandedCategories, setExpandedCategories] = useState<
    Record<string, Set<string>>
  >({
    Today: new Set(), // All categories for Today are expanded by default, an empty Set means all are expanded
  });
  const footerRef = useRef<HTMLDivElement>(null);
  const screens = useBreakpoint();

  // Async helper function to get category info
  const getCategoryInfo = async (category: string) => {
    // If already in cache, return directly
    if (categoryInfoCache[category]) {
      return categoryInfoCache[category];
    }

    // If loading, return default value
    if (loadingCategories.has(category)) {
      return {
        name: category,
        icon: "🔧",
        description: "Loading...",
        color: "#666666",
      };
    }

    try {
      // Mark as loading
      setLoadingCategories((prev) => new Set(prev).add(category));

      // Get category info
      const categoryInfo = await getCategoryDisplayInfoAsync(category);

      // Store in cache
      setCategoryInfoCache((prev) => ({
        ...prev,
        [category]: categoryInfo,
      }));

      return categoryInfo;
    } catch (error) {
      console.error(`Failed to get info for category ${category}:`, error);
      // Return default info
      const defaultInfo = {
        name: category,
        icon: "❌",
        description: "Failed to load category info",
        color: "#ff4d4f",
      };

      // Store default info in cache even on failure
      setCategoryInfoCache((prev) => ({
        ...prev,
        [category]: defaultInfo,
      }));

      return defaultInfo;
    } finally {
      // Remove loading flag
      setLoadingCategories((prev) => {
        const newSet = new Set(prev);
        newSet.delete(category);
        return newSet;
      });
    }
  };

  // Simple grouping and sorting function (avoids hardcoded weights)
  const sortGroupedChats = (
    grouped: Record<string, ChatItem[]>
  ): Record<string, ChatItem[]> => {
    // Put Pinned at the top, sort others alphabetically
    const sortedEntries = Object.entries(grouped).sort(
      ([categoryA], [categoryB]) => {
        if (categoryA === "Pinned") return -1;
        if (categoryB === "Pinned") return 1;
        return categoryA.localeCompare(categoryB);
      }
    );
    return Object.fromEntries(sortedEntries);
  };

  // Collapse/expand helper functions
  const toggleDateExpansion = (dateKey: string) => {
    setExpandedDates((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(dateKey)) {
        newSet.delete(dateKey);
      } else {
        newSet.add(dateKey);
        // When expanding a date, expand all its categories by default
        setExpandedCategories((prevCategories) => ({
          ...prevCategories,
          [dateKey]: new Set(), // Empty Set means all are expanded
        }));
      }
      return newSet;
    });
  };

  const toggleCategoryExpansion = (dateKey: string, category: string) => {
    setExpandedCategories((prev) => {
      const dateCategories = prev[dateKey] || new Set();
      const newDateCategories = new Set(dateCategories);

      if (newDateCategories.has(category)) {
        newDateCategories.delete(category);
      } else {
        newDateCategories.add(category);
      }

      return {
        ...prev,
        [dateKey]: newDateCategories,
      };
    });
  };

  const isDateExpanded = (dateKey: string): boolean => {
    return expandedDates.has(dateKey);
  };

  const isCategoryExpanded = (dateKey: string, category: string): boolean => {
    const dateCategories = expandedCategories[dateKey];
    if (!dateCategories) return false; // If date is not expanded, category is not expanded either
    return dateCategories.size === 0 || !dateCategories.has(category); // Empty Set means all are expanded
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

  // Group chats by date and category (new structure)
  const groupedChatsByDate = groupChatsByDateAndCategory(chats);
  const sortedDateKeys = getSortedDateKeys(groupedChatsByDate);

  // Keep old grouping for collapsed view
  const groupedChats = sortGroupedChats(groupChatsByToolCategory(chats));

  // Preload all category info
  useEffect(() => {
    const loadCategoryInfo = async () => {
      // Collect all categories from the new grouped structure
      const categories = new Set<string>();
      Object.values(groupedChatsByDate).forEach((dateGroup) => {
        Object.keys(dateGroup).forEach((category) => {
          categories.add(category);
        });
      });

      // Also collect categories from the old grouped structure (for collapsed view)
      Object.keys(groupedChats).forEach((category) => {
        categories.add(category);
      });

      for (const category of categories) {
        if (!categoryInfoCache[category] && !loadingCategories.has(category)) {
          try {
            await getCategoryInfo(category);
          } catch (error) {
            console.error(`Failed to preload category ${category}:`, error);
          }
        }
      }
    };

    if (
      Object.keys(groupedChatsByDate).length > 0 ||
      Object.keys(groupedChats).length > 0
    ) {
      loadCategoryInfo();
    }
  }, [chats]); // Listen for changes in chats

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

  const handleDeleteByDateAndCategory = (dateKey: string, category: string) => {
    const chatIds = getChatIdsByDateAndCategory(
      groupedChatsByDate,
      dateKey,
      category
    );

    Modal.confirm({
      title: `Delete chats from ${category}`,
      content: `Are you sure you want to delete all ${chatIds.length} chats from ${category} in ${dateKey}? This action cannot be undone.`,
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

  const handleSystemPromptSelect = (preset: SystemPromptPreset) => {
    try {
      // Create a new chat item that conforms to the Omit<ChatItem, 'id'> type
      addChat({
        title: `New Chat - ${preset.name}`,
        createdAt: Date.now(),
        messages: [],
        pinned: false,
        config: {
          systemPromptId: preset.id,
          toolCategory: preset.category,
          lastUsedEnhancedPrompt: null,
        },
        currentInteraction: null,
      });

      // The new chat is automatically selected in the store
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

                    {/* Categories within this date */}
                    {isDateOpen && (
                      <div style={{ marginLeft: "16px", marginTop: "8px" }}>
                        {Object.entries(dateGroup).map(
                          ([category, chatsInCategory]) => {
                            const categoryInfo = categoryInfoCache[
                              category
                            ] || {
                              name: category,
                              icon: "🔧",
                              description: "Loading...",
                              color: "#666666",
                            };
                            const isCategoryOpen = isCategoryExpanded(
                              dateKey,
                              category
                            );

                            return (
                              <div
                                key={`${dateKey}-${category}`}
                                style={{ marginBottom: "12px" }}
                              >
                                {/* Category Header */}
                                <Flex
                                  align="center"
                                  justify="space-between"
                                  style={{
                                    padding: "6px 8px",
                                    cursor: "pointer",
                                    borderRadius: "4px",
                                    transition: "background-color 0.2s",
                                    color: isCategoryOpen
                                      ? categoryInfo.color
                                      : themeMode === "light"
                                      ? "#000000"
                                      : "white",
                                  }}
                                  onClick={() =>
                                    toggleCategoryExpansion(dateKey, category)
                                  }
                                  className="category-group-header"
                                >
                                  <Flex align="center" gap="small">
                                    {isCategoryOpen ? (
                                      <DownOutlined
                                        style={{
                                          fontSize: "10px",
                                          color:
                                            themeMode === "light"
                                              ? "#000000"
                                              : "inherit",
                                        }}
                                      />
                                    ) : (
                                      <RightOutlined
                                        style={{
                                          fontSize: "10px",
                                          color:
                                            themeMode === "light"
                                              ? "#000000"
                                              : "inherit",
                                        }}
                                      />
                                    )}
                                    <span style={{ marginRight: 4 }}>
                                      {categoryInfo.icon}
                                    </span>
                                    <Text
                                      type="secondary"
                                      style={{
                                        fontSize: 12,
                                        color: categoryInfo.color,
                                        fontWeight: 500,
                                      }}
                                    >
                                      {categoryInfo.name} (
                                      {chatsInCategory.length})
                                    </Text>
                                  </Flex>

                                  {/* Category Delete Button */}
                                  <Button
                                    type="text"
                                    size="small"
                                    icon={<DeleteOutlined />}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteByDateAndCategory(
                                        dateKey,
                                        category
                                      );
                                    }}
                                    style={{ opacity: 0.5, fontSize: "10px" }}
                                    className="category-delete-btn"
                                  />
                                </Flex>

                                {/* Chat Items */}
                                {isCategoryOpen && (
                                  <List
                                    itemLayout="horizontal"
                                    dataSource={chatsInCategory}
                                    split={false}
                                    style={{ marginTop: "4px" }}
                                    renderItem={(chat: ChatItem) => (
                                      <ChatItemComponent
                                        key={chat.id}
                                        chat={chat}
                                        isSelected={chat.id === currentChatId}
                                        onSelect={(chatId) =>
                                          selectChat(chatId)
                                        }
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
                          }
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </Space>
        ) : (
          <Space direction="vertical" size="small" style={{ width: "100%" }}>
            {Object.values(groupedChats)
              .flat()
              .map((chat: ChatItem) => {
                const category = chat.config.toolCategory || "unknown";
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
        presets={systemPromptPresets}
        title="Create New Chat - Select System Prompt"
        showCancelButton={true}
      />
    </Sider>
  );
};
