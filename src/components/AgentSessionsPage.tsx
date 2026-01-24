import React, { useEffect, useMemo, useState } from "react";
import { Button, Card, Empty, Flex, Pagination, Tag, Typography } from "antd";
import {
  ArrowLeftOutlined,
  ClockCircleOutlined,
  MessageOutlined,
  PlusOutlined,
} from "@ant-design/icons";

import type {
  ClaudeProject,
  ClaudeSession,
} from "../services/ClaudeCodeService";
import { ClaudeMemoriesDropdown } from "./ClaudeMemoriesDropdown";

const { Title, Text } = Typography;

type AgentSessionsPageProps = {
  project: ClaudeProject;
  sessions: ClaudeSession[];
  loading: boolean;
  error?: string | null;
  onBackToProjects: () => void;
  onSelectSession: (session: ClaudeSession) => void;
  onNewSession: () => void;
  onRefresh: () => void;
};

const ITEMS_PER_PAGE = 12;

const truncateText = (value: string, max = 120): string => {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
};

const getFirstLine = (value: string): string => {
  return value.split(/\r?\n/)[0]?.trim() ?? "";
};

const formatSessionDate = (session: ClaudeSession): string => {
  if (session.message_timestamp) {
    const date = new Date(session.message_timestamp);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
  }
  const created = new Date(session.created_at * 1000);
  if (!Number.isNaN(created.getTime())) {
    return created.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  return "Unknown date";
};

export const AgentSessionsPage: React.FC<AgentSessionsPageProps> = ({
  project,
  sessions,
  loading,
  error,
  onBackToProjects,
  onSelectSession,
  onNewSession,
  onRefresh,
}) => {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [sessions.length]);

  const startIndex = (page - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const pageSessions = useMemo(
    () => sessions.slice(startIndex, endIndex),
    [sessions, startIndex, endIndex],
  );

  const projectName = useMemo(() => {
    const parts = project.path.split("/").filter(Boolean);
    return parts[parts.length - 1] || project.id;
  }, [project.id, project.path]);

  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
        <Flex
          justify="space-between"
          align="center"
          style={{ marginBottom: 24 }}
        >
          <Flex align="center" gap={12}>
            <Button icon={<ArrowLeftOutlined />} onClick={onBackToProjects} />
            <div>
              <Title level={3} style={{ marginBottom: 4 }}>
                {projectName}
              </Title>
              <Text type="secondary">{sessions.length} sessions</Text>
            </div>
          </Flex>
          <Flex align="center" gap={12}>
            <Button onClick={onRefresh}>Refresh</Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={onNewSession}
            >
              New session
            </Button>
          </Flex>
        </Flex>

        <div style={{ marginBottom: 16 }}>
          <ClaudeMemoriesDropdown projectPath={project.path} />
        </div>

        {error ? <Text type="danger">{error}</Text> : null}

        {loading ? (
          <Card loading />
        ) : sessions.length === 0 ? (
          <Empty description="No sessions yet" />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 16,
            }}
          >
            {pageSessions.map((session) => (
              <Card
                key={session.id}
                hoverable
                onClick={() => onSelectSession(session)}
                styles={{ body: { padding: 12 } }}
              >
                <Flex vertical style={{ height: "100%" }} gap={8}>
                  <Flex align="center" justify="space-between">
                    <Flex align="center" gap={6}>
                      <ClockCircleOutlined />
                      <Text strong>
                        Session on {formatSessionDate(session)}
                      </Text>
                    </Flex>
                    {session.todo_data ? <Tag color="blue">Todo</Tag> : null}
                  </Flex>
                  {session.first_message ? (
                    <Text type="secondary">
                      {truncateText(getFirstLine(session.first_message))}
                    </Text>
                  ) : (
                    <Text type="secondary" italic>
                      No messages yet
                    </Text>
                  )}
                  <Flex
                    justify="space-between"
                    align="center"
                    style={{ marginTop: "auto" }}
                  >
                    <Text type="secondary" style={{ fontFamily: "monospace" }}>
                      {session.id.slice(-8)}
                    </Text>
                    {session.todo_data ? <MessageOutlined /> : null}
                  </Flex>
                </Flex>
              </Card>
            ))}
          </div>
        )}

        {sessions.length > ITEMS_PER_PAGE ? (
          <Flex justify="center" style={{ marginTop: 16 }}>
            <Pagination
              size="small"
              current={page}
              total={sessions.length}
              pageSize={ITEMS_PER_PAGE}
              onChange={(next) => setPage(next)}
              showSizeChanger={false}
            />
          </Flex>
        ) : null}
      </div>
    </div>
  );
};
