import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "antd";

import {
  getChatCountByDate,
  getChatIdsByDate,
  getDateGroupKeyForChat,
  getSortedDateKeys,
  groupChatsByDate,
} from "../../utils/chatUtils";
import { useSettingsViewStore } from "../../store/settingsViewStore";
import { useChatTitleGeneration } from "../../hooks/useChatManager/useChatTitleGeneration";
import { useAppStore } from "../../store";
import type { ChatItem, UserSystemPrompt } from "../../types/chat";

export const useChatSidebarState = () => {
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
  const [expandedDates, setExpandedDates] = useState<Set<string>>(
    new Set(["Today"]),
  );
  const footerRef = useRef<HTMLDivElement>(null);

  const expandedKeys = useMemo(
    () => Array.from(expandedDates),
    [expandedDates],
  );

  const handleCollapseChange = (keys: string | string[]) => {
    const next = new Set(Array.isArray(keys) ? keys : [keys]);
    setExpandedDates(next);
  };

  useEffect(() => {
    loadSystemPrompts();
  }, [loadSystemPrompts]);

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

  return {
    chats,
    collapsed,
    currentChatId,
    expandedKeys,
    footerHeight,
    footerRef,
    groupedChatsByDate,
    handleCollapseChange,
    handleDelete,
    handleDeleteByDate,
    handleEditTitle,
    handleGenerateTitle,
    handleNewChat,
    handleNewChatSelectorClose,
    handleOpenSettings,
    handleSystemPromptSelect,
    isNewChatSelectorOpen,
    pinChat,
    selectChat,
    setCollapsed,
    sortedDateKeys,
    systemPrompts,
    titleGenerationState,
    unpinChat,
  };
};
