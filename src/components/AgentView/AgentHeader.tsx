import React from "react";
import { Badge, Button, Flex, Tabs, Tag, Typography, theme } from "antd";
import {
  FolderOpenOutlined,
  HistoryOutlined,
  ToolOutlined,
} from "@ant-design/icons";

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
  onReloadHistory: () => void;
  onCancelRun: () => void;
  canReloadHistory: boolean;
  isRunning: boolean;
  onGoProjects?: () => void;
  onGoSessions?: () => void;
  projectLabel?: string | null;
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
    onReloadHistory,
    onCancelRun,
    canReloadHistory,
    isRunning,
    onGoProjects,
    onGoSessions,
    projectLabel,
  }: AgentHeaderProps) => {
    return (
      <Flex
        justify="space-between"
        align="center"
        style={{ gap: token.marginSM }}
      >
        <Flex vertical style={{ minWidth: 0 }}>
          <Text strong>Agent</Text>
          <Text type="secondary" ellipsis>
            {resolvedProjectPath ?? "Select a project to begin"}
          </Text>
          {onGoProjects || onGoSessions ? (
            <Flex style={{ gap: token.marginXS, flexWrap: "wrap" }}>
              {onGoProjects ? (
                <Button
                  type="primary"
                  ghost
                  size="small"
                  icon={<FolderOpenOutlined />}
                  onClick={onGoProjects}
                >
                  Projects
                </Button>
              ) : null}
              {onGoSessions ? (
                <Button
                  size="small"
                  icon={<HistoryOutlined />}
                  onClick={onGoSessions}
                >
                  {projectLabel ?? "Sessions"}
                </Button>
              ) : null}
            </Flex>
          ) : null}
          <Flex style={{ gap: token.marginXS, flexWrap: "wrap" }}>
            {isRunning || runSessionId ? (
              <Tag color="processing">Running</Tag>
            ) : null}
            {selectedSessionId ? <Tag>{selectedSessionId}</Tag> : null}
          </Flex>
        </Flex>
        <Flex style={{ gap: token.marginSM }}>
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
          <Button danger onClick={onCancelRun} disabled={!isRunning}>
            Cancel
          </Button>
        </Flex>
      </Flex>
    );
  },
);

AgentHeader.displayName = "AgentHeader";
