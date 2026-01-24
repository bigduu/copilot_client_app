import React from "react";
import { Button, Flex, Tooltip } from "antd";
import { PlusOutlined, SettingOutlined } from "@ant-design/icons";

type ChatSidebarFooterProps = {
  collapsed: boolean;
  footerRef: React.RefObject<HTMLDivElement>;
  onNewChat: () => void;
  onOpenSettings: () => void;
  screens: { xs?: boolean };
  token: any;
};

export const ChatSidebarFooter: React.FC<ChatSidebarFooterProps> = ({
  collapsed,
  footerRef,
  onNewChat,
  onOpenSettings,
  screens,
  token,
}) => {
  return (
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
          onClick={onNewChat}
          block={!collapsed}
          shape={collapsed ? "circle" : "default"}
          size={collapsed ? "large" : screens.xs ? "small" : "middle"}
          style={
            collapsed ? { width: "44px", height: "44px", margin: "0 auto" } : {}
          }
        >
          {!collapsed && "New Chat"}
        </Button>
      </Tooltip>

      <Tooltip placement={collapsed ? "right" : "top"} title="System Settings">
        <Button
          icon={<SettingOutlined />}
          onClick={onOpenSettings}
          block={!collapsed}
          shape={collapsed ? "circle" : "default"}
          size={collapsed ? "large" : screens.xs ? "small" : "middle"}
          style={
            collapsed ? { width: "44px", height: "44px", margin: "0 auto" } : {}
          }
        >
          {!collapsed && "System Settings"}
        </Button>
      </Tooltip>
    </Flex>
  );
};
