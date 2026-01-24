import React, { useMemo } from "react";
import { Card, Empty, Flex, Menu, Spin, Typography } from "antd";

import type { ClaudeProject } from "../../services/ClaudeCodeService";

const { Text } = Typography;

type ProjectMenuItem = {
  key: string;
  label: ClaudeProject;
};

type AgentSidebarProjectsCardProps = {
  projects: ClaudeProject[];
  menuItems: ProjectMenuItem[];
  isLoading: boolean;
  query: string;
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
};

export const AgentSidebarProjectsCard: React.FC<
  AgentSidebarProjectsCardProps
> = ({
  projects,
  menuItems,
  isLoading,
  query,
  selectedProjectId,
  onSelectProject,
}) => {
  const items = useMemo(
    () =>
      menuItems.map((item) => ({
        key: item.key,
        label: (
          <Flex vertical style={{ minWidth: 0 }}>
            <Text ellipsis>{item.label.path}</Text>
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
      title="Projects"
      styles={{ body: { padding: 0, minHeight: 0 } }}
      style={{ minHeight: 0, flex: 1 }}
    >
      <Spin spinning={isLoading}>
        {menuItems.length ? (
          <div style={{ maxHeight: "100%", overflow: "auto" }}>
            <Menu
              mode="inline"
              selectedKeys={selectedProjectId ? [selectedProjectId] : []}
              items={items}
              onSelect={(info) => {
                const project = projects.find((p) => p.id === info.key);
                if (project) {
                  onSelectProject(project.id);
                }
              }}
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
                {query ? "No matches" : "No projects"}
              </Text>
            }
          />
        )}
      </Spin>
    </Card>
  );
};
