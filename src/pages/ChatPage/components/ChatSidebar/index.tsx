import React, { useEffect } from "react";
import { Flex, Layout, theme } from "antd";
import { MenuFoldOutlined, MenuUnfoldOutlined } from "@ant-design/icons";
import { Button } from "antd";
import { Grid } from "antd";

import SystemPromptSelector from "../SystemPromptSelector";
import { ChatSidebarCollapsedMenu } from "./ChatSidebarCollapsedMenu";
import { ChatSidebarDateGroups } from "./ChatSidebarDateGroups";
import { ChatSidebarFooter } from "./ChatSidebarFooter";
import { useChatSidebarState } from "./useChatSidebarState";

const { Sider } = Layout;
const { useBreakpoint } = Grid;
const { useToken } = theme;

export const ChatSidebar: React.FC = () => {
  const { token } = useToken();
  const screens = useBreakpoint();

  const {
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
  } = useChatSidebarState();

  useEffect(() => {
    if (screens.xs === false && screens.sm === false) {
      setCollapsed(true);
    }
  }, [screens, setCollapsed]);

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
      collapsedWidth={72}
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

      <Flex
        vertical
        style={{
          height: `calc(100vh - ${footerHeight}px)`,
          overflowY: "auto",
          padding: collapsed ? "40px 10px 0 10px" : "40px 12px 0 12px",
        }}
      >
        {!collapsed ? (
          <ChatSidebarDateGroups
            groupedChatsByDate={groupedChatsByDate}
            sortedDateKeys={sortedDateKeys}
            expandedKeys={expandedKeys}
            onCollapseChange={handleCollapseChange}
            currentChatId={currentChatId}
            onSelectChat={selectChat}
            onDeleteChat={handleDelete}
            onDeleteByDate={handleDeleteByDate}
            onPinChat={pinChat}
            onUnpinChat={unpinChat}
            onEditTitle={handleEditTitle}
            onGenerateTitle={handleGenerateTitle}
            titleGenerationState={titleGenerationState}
            token={token}
          />
        ) : (
          <ChatSidebarCollapsedMenu
            chats={chats}
            currentChatId={currentChatId}
            onSelectChat={selectChat}
            screens={screens}
            token={token}
          />
        )}
      </Flex>

      <ChatSidebarFooter
        collapsed={collapsed}
        footerRef={footerRef}
        onNewChat={handleNewChat}
        onOpenSettings={handleOpenSettings}
        screens={screens}
        token={token}
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
