import React, { useMemo } from "react";
import { Avatar, Menu } from "antd";

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
  const items = useMemo(
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

  return (
    <Menu
      mode="inline"
      inlineCollapsed
      selectedKeys={currentChatId ? [currentChatId] : []}
      items={items}
      onSelect={(info) => onSelectChat(info.key)}
      style={{ borderInlineEnd: "none", background: "transparent" }}
    />
  );
};
