import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Layout,
  Button,
  Modal,
  List,
  Menu,
  Typography,
  Empty,
  Space,
  Tooltip,
  Avatar,
  Grid,
  Flex,
  theme,
  Collapse,
} from "antd";
import {
  PlusOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  DeleteOutlined,
  CalendarOutlined,
} from "@ant-design/icons";
import {
  groupChatsByDate,
  getSortedDateKeys,
  getChatIdsByDate,
  getChatCountByDate,
  getDateGroupKeyForChat,
} from "../../utils/chatUtils";
import { useSettingsViewStore } from "../../store/settingsViewStore";
import { ChatItem as ChatItemComponent } from "../ChatItem";
import { ChatItem } from "../../types/chat";
import SystemPromptSelector from "../SystemPromptSelector";
import { UserSystemPrompt } from "../../types/chat";
import { useChatTitleGeneration } from "../../hooks/useChatManager/useChatTitleGeneration";
import { useAppStore } from "../../store";

const { Sider } = Layout;
const { Text } = Typography;
const { useBreakpoint } = Grid;
const { useToken } = theme;

export const ChatSidebar: React.FC = () => {
  const { token } = useToken();
  const chats = useAppStore((state) => state.chats);
  const currentChatId = useAppStore((state) => state.currentChatId);
  const selectChat = useAppStore((state) => state.selectChat);
  const deleteChat = useAppStore((state) => state.deleteChat);
  const deleteChats = useAppStore((state) => state.deleteChats);
  const pinChat = useAppStore((state) => state.pinChat);
  const unpinChat = useAppStore((state) => state.unpinChat);
  const updateChat = useAppStore((state) => state.updateChat);
  const addChat = useAppStore((state) => state.addChat);
  const lastSelectedPromptId = useAppStore(
    (state) => state.lastSelectedPromptId,
  );

  const systemPrompts = useAppStore((state) => state.systemPrompts);
  const loadSystemPrompts = useAppStore((state) => state.loadSystemPrompts);

  const { generateChatTitle, titleGenerationState } = useChatTitleGeneration({
    chats,
    updateChat,
  });

  const createNewChat = useCallback(
    async (title?: string, options?: Partial<Omit<ChatItem, "id">>) => {
      const selectedPrompt = systemPrompts.find(
        (p) => p.id === lastSelectedPromptId,
      );

      const systemPromptId =
        selectedPrompt?.id ||
        (systemPrompts.length > 0
          ? systemPrompts.find((p) => p.id === "general_assistant")?.id ||
            systemPrompts[0].id
          : "");

      const newChatData: Omit<ChatItem, "id"> = {
        title: title || "New Chat",
        createdAt: Date.now(),
        messages: [],
        config: {
          systemPromptId,
          baseSystemPrompt:
            selectedPrompt?.content ||
            (systemPrompts.length > 0
              ? systemPrompts.find((p) => p.id === "general_assistant")
                  ?.content || systemPrompts[0].content
              : ""),
          lastUsedEnhancedPrompt: null,
        },
        currentInteraction: null,
        ...options,
      };
      await addChat(newChatData);
    },
    [addChat, lastSelectedPromptId, systemPrompts],
  );

  const [isNewChatSelectorOpen, setIsNewChatSelectorOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [footerHeight, setFooterHeight] = useState(0);

  // Collapse/expand state management
  const [expandedDates, setExpandedDates] = useState<Set<string>>(
    new Set(["Today"]), // Expand Today by default
  );
  const footerRef = useRef<HTMLDivElement>(null);
  const screens = useBreakpoint();

  // Collapse/expand helper functions
  const expandedKeys = React.useMemo(
    () => Array.from(expandedDates),
    [expandedDates],
  );

  const handleCollapseChange = (keys: string | string[]) => {
    const next = new Set(Array.isArray(keys) ? keys : [keys]);
    setExpandedDates(next);
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

  // Auto-expand the date group containing the current chat
  useEffect(() => {
    if (currentChatId && chats.length > 0) {
      const currentChat = chats.find((chat) => chat.id === currentChatId);
      if (currentChat) {
        const dateGroupKey = getDateGroupKeyForChat(currentChat);
        setExpandedDates((prev) => {
          if (!prev.has(dateGroupKey)) {
            const newSet = new Set(prev);
            newSet.add(dateGroupKey);
            return newSet;
          }
          return prev;
        });
      }
    }
  }, [currentChatId, chats]);

  // Group chats by date
  const groupedChatsByDate = groupChatsByDate(chats);
  const sortedDateKeys = getSortedDateKeys(groupedChatsByDate);

  const collapsedMenuItems = React.useMemo(
    () =>
      chats.map((chat) => {
        const isSelected = chat.id === currentChatId;
        return {
          key: chat.id,
          icon: (
            <Avatar
              size={screens.xs ? 32 : 36}
              style={{
                backgroundColor: isSelected
                  ? token.colorPrimary
                  : token.colorFillTertiary,
                color: isSelected
                  ? token.colorTextLightSolid
                  : token.colorTextSecondary,
              }}
            >
              {chat.title.charAt(0)}
            </Avatar>
          ),
          label: chat.title,
        };
      }),
    [
      chats,
      currentChatId,
      screens.xs,
      token.colorFillTertiary,
      token.colorPrimary,
      token.colorTextLightSolid,
      token.colorTextSecondary,
    ],
  );

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

  const openSettings = useSettingsViewStore((state) => state.open);

  const handleOpenSettings = () => {
    openSettings("chat");
  };

  const handleEditTitle = (chatId: string, newTitle: string) => {
    updateChat(chatId, { title: newTitle });
  };

  const handleGenerateTitle = async (chatId: string) => {
    try {
      await generateChatTitle(chatId, { force: true });
    } catch (error) {
      console.error("Failed to generate title:", error);
    }
  };

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

  const collapseItems = React.useMemo(() => {
    if (!sortedDateKeys.length) {
      return [];
    }

    return sortedDateKeys.map((dateKey) => {
      const dateGroup = groupedChatsByDate[dateKey];
      const totalChatsInDate = getChatCountByDate(groupedChatsByDate, dateKey);

      return {
        key: dateKey,
        label: (
          <Flex align="center" gap="small" style={{ minWidth: 0 }}>
            <CalendarOutlined />
            <Text
              strong
              style={{
                fontSize: 14,
                color:
                  dateKey === "Today" ? token.colorPrimary : token.colorText,
              }}
            >
              {dateKey} ({totalChatsInDate})
            </Text>
          </Flex>
        ),
        extra: (
          <Button
            type="text"
            size="small"
            icon={<DeleteOutlined />}
            danger
            onClick={(event) => {
              event.stopPropagation();
              handleDeleteByDate(dateKey);
            }}
          />
        ),
        children: (
          <List
            itemLayout="horizontal"
            dataSource={dateGroup}
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
                isGeneratingTitle={
                  titleGenerationState[chat.id]?.status === "loading"
                }
                titleGenerationError={
                  titleGenerationState[chat.id]?.status === "error"
                    ? titleGenerationState[chat.id]?.error
                    : undefined
                }
              />
            )}
          />
        ),
      };
    });
  }, [
    groupedChatsByDate,
    handleDelete,
    handleDeleteByDate,
    currentChatId,
    pinChat,
    unpinChat,
    selectChat,
    sortedDateKeys,
    token.colorPrimary,
    token.colorText,
    titleGenerationState,
    handleEditTitle,
    handleGenerateTitle,
  ]);

  const handleNewChat = () => {
    setIsNewChatSelectorOpen(true);
  };

  const handleNewChatSelectorClose = () => {
    setIsNewChatSelectorOpen(false);
  };

  const handleSystemPromptSelect = async (preset: UserSystemPrompt) => {
    try {
      await createNewChat(`New Chat - ${preset.name}`, {
        config: {
          systemPromptId: preset.id,
          baseSystemPrompt: preset.content,
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
        background: token.colorBgContainer,
        borderRight: `1px solid ${token.colorBorderSecondary}`,
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
          padding: collapsed ? "40px 8px 0 8px" : "40px 12px 0 12px",
        }}
      >
        {!collapsed ? (
          <Space direction="vertical" size="small" style={{ width: "100%" }}>
            {sortedDateKeys.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <Space direction="vertical" size={4}>
                    <Text type="secondary">No chats yet</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Click "New Chat" to get started
                    </Text>
                  </Space>
                }
              />
            ) : (
              <Collapse
                size="small"
                ghost
                activeKey={expandedKeys}
                onChange={handleCollapseChange}
                items={collapseItems}
              />
            )}
          </Space>
        ) : (
          <Menu
            mode="inline"
            inlineCollapsed
            selectedKeys={currentChatId ? [currentChatId] : []}
            items={collapsedMenuItems}
            onSelect={(info) => selectChat(info.key)}
            style={{ borderInlineEnd: "none", background: "transparent" }}
          />
        )}
      </Flex>

      {/* Bottom action area */}
      <Flex
        ref={footerRef}
        vertical
        gap={collapsed ? "small" : "middle"}
        style={{
          padding: collapsed ? 8 : 16,
          background: token.colorBgContainer,
          borderTop: `1px solid ${token.colorBorderSecondary}`,
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
