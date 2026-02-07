import React, { useMemo } from "react";
import { Avatar, Flex, Tooltip } from "antd";

import type { ChatItem } from "../../types/chat";

type ChatSidebarCollapsedMenuProps = {
  chats: ChatItem[];
  currentChatId: string | null;
  onSelectChat: (chatId: string) => void;
  screens: { xs?: boolean };
  token: any;
};

export const ChatSidebarCollapsedMenu: React.FC<
  ChatSidebarCollapsedMenuProps
> = ({ chats, currentChatId, onSelectChat, screens, token }) => {
  const items = useMemo(() => chats, [chats]);

  return (
    <Flex vertical gap={8} style={{ width: "100%" }}>
      {items.map((chat) => {
        const isSelected = chat.id === currentChatId;

        return (
          <Tooltip key={chat.id} placement="right" title={chat.title}>
            <button
              type="button"
              onClick={() => onSelectChat(chat.id)}
              style={{
                border: "none",
                background: "transparent",
                width: 44,
                height: 44,
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto",
                cursor: "pointer",
                borderRadius: 999,
              }}
            >
              <Avatar
                size={screens.xs ? 30 : 34}
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
            </button>
          </Tooltip>
        );
      })}
    </Flex>
  );
};
