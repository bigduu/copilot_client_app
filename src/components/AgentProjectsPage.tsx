import React, { useMemo, useState } from "react";
import { Button, Card, Flex, List, Pagination, Typography } from "antd";
import { FolderOpenOutlined } from "@ant-design/icons";

import type { ClaudeProject } from "../services/ClaudeCodeService";

const { Title, Text } = Typography;

type AgentProjectsPageProps = {
  projects: ClaudeProject[];
  loading: boolean;
  error?: string | null;
  onOpenProject: () => void;
  onSelectProject: (project: ClaudeProject) => void;
};

const getProjectName = (path: string): string => {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] || path;
};

const getDisplayPath = (path: string, maxLength = 40): string => {
  let displayPath = path;
  if (path.includes("/Users/") || path.includes("/home/")) {
    const parts = path.split("/");
    const idx = parts.findIndex(
      (_part, i) =>
        i > 0 && (parts[i - 1] === "Users" || parts[i - 1] === "home"),
    );
    if (idx > 0) {
      const relative = parts.slice(idx + 1).join("/");
      displayPath = `~/${relative}`;
    }
  }
  if (displayPath.length > maxLength) {
    const start = displayPath.slice(0, Math.floor(maxLength / 2) - 2);
    const end = displayPath.slice(
      displayPath.length - Math.floor(maxLength / 2) + 2,
    );
    return `${start}...${end}`;
  }
  return displayPath;
};

export const AgentProjectsPage: React.FC<AgentProjectsPageProps> = ({
  projects,
  loading,
  error,
  onOpenProject,
  onSelectProject,
}) => {
  const [showAll, setShowAll] = useState(false);
  const [page, setPage] = useState(1);
  const perPage = showAll ? 10 : 5;
  const totalPages = Math.max(1, Math.ceil(projects.length / perPage));
  const startIndex = showAll ? (page - 1) * perPage : 0;
  const endIndex = startIndex + perPage;

  const visibleProjects = useMemo(
    () => projects.slice(startIndex, endIndex),
    [projects, startIndex, endIndex],
  );

  const handleToggleView = () => {
    setShowAll((prev) => !prev);
    setPage(1);
  };

  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: 24 }}>
        <Flex justify="space-between" align="center">
          <div>
            <Title level={2} style={{ marginBottom: 4 }}>
              Projects
            </Title>
            <Text type="secondary">
              Select a project to start working with Claude Code
            </Text>
          </div>
          <Flex align="center" gap={12}>
            <Button
              type="primary"
              icon={<FolderOpenOutlined />}
              onClick={onOpenProject}
            >
              Open Project
            </Button>
          </Flex>
        </Flex>

        <div style={{ marginTop: 24 }}>
          <Card
            title={
              <Flex justify="space-between" align="center">
                <Text strong>Recent Projects</Text>
                {projects.length ? (
                  <Button type="link" onClick={handleToggleView}>
                    {showAll ? "View less" : `View all (${projects.length})`}
                  </Button>
                ) : null}
              </Flex>
            }
            loading={loading}
          >
            {error ? <Text type="danger">{error}</Text> : null}
            {projects.length === 0 && !loading ? (
              <Flex vertical align="center" style={{ padding: 40 }}>
                <FolderOpenOutlined style={{ fontSize: 36 }} />
                <Text strong style={{ marginTop: 12 }}>
                  No recent projects
                </Text>
                <Text type="secondary" style={{ marginBottom: 16 }}>
                  Open a project to get started with Claude Code
                </Text>
                <Button type="primary" onClick={onOpenProject}>
                  Open Your First Project
                </Button>
              </Flex>
            ) : (
              <List
                dataSource={visibleProjects}
                renderItem={(project) => (
                  <List.Item
                    style={{ cursor: "pointer" }}
                    onClick={() => onSelectProject(project)}
                  >
                    <Flex justify="space-between" style={{ width: "100%" }}>
                      <Text strong>{getProjectName(project.path)}</Text>
                      <Text
                        type="secondary"
                        style={{ fontFamily: "monospace" }}
                      >
                        {getDisplayPath(project.path)}
                      </Text>
                    </Flex>
                  </List.Item>
                )}
              />
            )}

            {showAll && totalPages > 1 ? (
              <Flex justify="center" style={{ marginTop: 16 }}>
                <Pagination
                  size="small"
                  current={page}
                  total={projects.length}
                  pageSize={perPage}
                  onChange={(next) => setPage(next)}
                  showSizeChanger={false}
                />
              </Flex>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
};
