import React, { useMemo } from "react";
import { Button, Collapse, Empty, Flex, List, Space, Typography } from "antd";
import { CalendarOutlined, DeleteOutlined } from "@ant-design/icons";

import { ChatItem as ChatItemComponent } from "../ChatItem";
import type { ChatItem } from "../../types/chat";
import { getChatCountByDate } from "../../utils/chatUtils";

const { Text } = Typography;

type ChatSidebarDateGroupsProps = {
  groupedChatsByDate: Record<string, ChatItem[]>;
  sortedDateKeys: string[];
  expandedKeys: string[];
  onCollapseChange: (keys: string | string[]) => void;
  currentChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onDeleteByDate: (dateKey: string) => void;
  onPinChat: (chatId: string) => void;
  onUnpinChat: (chatId: string) => void;
  onEditTitle: (chatId: string, title: string) => void;
  onGenerateTitle: (chatId: string) => void;
  titleGenerationState: Record<
    string,
    { status: "loading" | "error" | "idle"; error?: string }
  >;
  token: any;
};

export const ChatSidebarDateGroups: React.FC<ChatSidebarDateGroupsProps> = ({
  groupedChatsByDate,
  sortedDateKeys,
  expandedKeys,
  onCollapseChange,
  currentChatId,
  onSelectChat,
  onDeleteChat,
  onDeleteByDate,
  onPinChat,
  onUnpinChat,
  onEditTitle,
  onGenerateTitle,
  titleGenerationState,
  token,
}) => {
  const items = useMemo(() => {
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
              onDeleteByDate(dateKey);
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
                onSelect={onSelectChat}
                onDelete={onDeleteChat}
                onPin={onPinChat}
                onUnpin={onUnpinChat}
                onEdit={onEditTitle}
                onGenerateTitle={onGenerateTitle}
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
    sortedDateKeys,
    currentChatId,
    onDeleteByDate,
    onDeleteChat,
    onEditTitle,
    onGenerateTitle,
    onPinChat,
    onSelectChat,
    onUnpinChat,
    titleGenerationState,
    token.colorPrimary,
    token.colorText,
  ]);

  if (!sortedDateKeys.length) {
    return (
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
    );
  }

  return (
    <Space direction="vertical" size="small" style={{ width: "100%" }}>
      <Collapse
        size="small"
        ghost
        activeKey={expandedKeys}
        onChange={onCollapseChange}
        items={items}
      />
    </Space>
  );
};
