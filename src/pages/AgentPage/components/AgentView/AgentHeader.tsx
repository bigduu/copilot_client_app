import React from "react";
import { Badge, Button, Flex, Tabs, Tag, Typography, theme } from "antd";
import { FolderOpenOutlined, ToolOutlined } from "@ant-design/icons";

const { Text } = Typography;

export type AgentHeaderProps = {
  token: ReturnType<typeof theme.useToken>["token"];
  resolvedProjectPath: string | null;
  runSessionId: string | null;
  selectedSessionId: string | null;
  queuedCount: number;
  view: "chat" | "debug";
  onViewChange: (value: "chat" | "debug") => void;
  onOpenTools: () => void;
  sessionTabs: Array<{
    key: string;
    label: string;
    running: boolean;
    isProject?: boolean;
  }>;
  activeSessionTab: string;
  onSessionTabChange: (key: string) => void;
  onReloadHistory: () => void;
  onCancelRun: () => void;
  canReloadHistory: boolean;
  isRunning: boolean;
};

export const AgentHeader: React.FC<AgentHeaderProps> = React.memo(
  ({
    token,
    resolvedProjectPath,
    runSessionId,
    selectedSessionId,
    queuedCount,
    view,
    onViewChange,
    onOpenTools,
    sessionTabs,
    activeSessionTab,
    onSessionTabChange,
    onReloadHistory,
    onCancelRun,
    canReloadHistory,
    isRunning,
  }: AgentHeaderProps) => {
    return (
      <Flex vertical className="agent-header" style={{ gap: token.marginSM }}>
        <Flex
          justify="space-between"
          align="center"
          style={{ gap: token.marginSM }}
        >
          <Flex vertical style={{ minWidth: 0, gap: token.marginXS }}>
            <Text strong>Agent</Text>
            <Text type="secondary" ellipsis>
              {resolvedProjectPath ?? "Select a project to begin"}
            </Text>
          </Flex>
          <Flex align="center" style={{ gap: token.marginSM }}>
            <Tabs
              size="small"
              activeKey={view}
              onChange={(value) => onViewChange(value as "chat" | "debug")}
              items={[
                { key: "chat", label: "Chat" },
                { key: "debug", label: "Debug" },
              ]}
            />
            <Badge count={queuedCount} size="small">
              <Button icon={<ToolOutlined />} onClick={onOpenTools}>
                Tools
              </Button>
            </Badge>
            <Button onClick={onReloadHistory} disabled={!canReloadHistory}>
              Reload History
            </Button>
            <Button
              danger
              onClick={onCancelRun}
              disabled={!isRunning || !(runSessionId ?? selectedSessionId)}
            >
              Cancel
            </Button>
          </Flex>
        </Flex>
        {sessionTabs.length ? (
          <Flex align="center" style={{ gap: token.marginSM }}>
            <Tabs
              className="agent-session-tabs"
              size="middle"
              type="card"
              activeKey={activeSessionTab}
              onChange={onSessionTabChange}
              items={sessionTabs.map((tab) => ({
                key: tab.key,
                label: (
                  <Badge dot={tab.running} size="small">
                    <span className="agent-session-tab-label">
                      {tab.isProject ? <FolderOpenOutlined /> : null}
                      {tab.label}
                    </span>
                  </Badge>
                ),
              }))}
            />
            {isRunning || runSessionId ? (
              <Tag color="processing">Running</Tag>
            ) : null}
          </Flex>
        ) : null}
      </Flex>
    );
  },
);

AgentHeader.displayName = "AgentHeader";
