import React, { useMemo } from "react";
import { Card, Empty, Flex, Menu, Spin, Typography } from "antd";

import type {
  ClaudeProject,
  ClaudeSession,
} from "../../services/ClaudeCodeService";

const { Text } = Typography;

type SessionMenuItem = {
  key: string;
  label: ClaudeSession;
};

type AgentSidebarSessionsCardProps = {
  menuItems: SessionMenuItem[];
  isLoading: boolean;
  selectedProject: ClaudeProject | null;
  selectedProjectId: string | null;
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
};

export const AgentSidebarSessionsCard: React.FC<
  AgentSidebarSessionsCardProps
> = ({
  menuItems,
  isLoading,
  selectedProject,
  selectedProjectId,
  selectedSessionId,
  onSelectSession,
}) => {
  const items = useMemo(
    () =>
      menuItems.map((item) => ({
        key: item.key,
        label: (
          <Flex vertical style={{ minWidth: 0 }}>
            <Text ellipsis>{item.label.first_message || item.label.id}</Text>
            <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
              {item.label.id}
            </Text>
          </Flex>
        ),
      })),
    [menuItems],
  );

  return (
    <Card
      size="small"
      title="Sessions"
      styles={{ body: { padding: 0, minHeight: 0 } }}
      style={{ minHeight: 0, flex: 1 }}
    >
      <Text type="secondary" style={{ display: "block", padding: "0 12px" }}>
        {selectedProject ? selectedProject.path : "Select a project"}
      </Text>
      <Spin spinning={isLoading}>
        {menuItems.length ? (
          <div style={{ maxHeight: "100%", overflow: "auto" }}>
            <Menu
              mode="inline"
              selectedKeys={selectedSessionId ? [selectedSessionId] : []}
              items={items}
              onSelect={(info) => onSelectSession(info.key)}
              style={{
                borderInlineEnd: "none",
                background: "transparent",
              }}
            />
          </div>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Text type="secondary">
                {selectedProjectId ? "No sessions" : "Select a project first"}
              </Text>
            }
          />
        )}
      </Spin>
    </Card>
  );
};
