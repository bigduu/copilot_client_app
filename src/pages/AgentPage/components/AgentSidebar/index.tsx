import React from "react";
import { Alert, Button, Flex, Input, Layout, theme } from "antd";
import { FolderOpenOutlined, ReloadOutlined } from "@ant-design/icons";

import { useAgentStore } from "../../store/agentStore";
import { ModeSwitcher } from "../../../../shared/components/ModeSwitcher";
import { AgentSidebarProjectsCard } from "./AgentSidebarProjectsCard";
import { AgentSidebarSessionsCard } from "./AgentSidebarSessionsCard";
import { useAgentSidebarData } from "./useAgentSidebarData";

const { Sider } = Layout;

export const AgentSidebar: React.FC = () => {
  const { token } = theme.useToken();
  const selectedProjectId = useAgentStore((s) => s.selectedProjectId);
  const selectedSessionId = useAgentStore((s) => s.selectedSessionId);
  const sessionsRefreshNonce = useAgentStore((s) => s.sessionsRefreshNonce);
  const setSelectedProject = useAgentStore((s) => s.setSelectedProject);
  const setSelectedSessionId = useAgentStore((s) => s.setSelectedSessionId);

  const {
    error,
    filteredProjects,
    isLoadingProjects,
    isLoadingSessions,
    loadProjects,
    openProject,
    projectMenuItems,
    query,
    selectedProject,
    sessionMenuItems,
    setQuery,
  } = useAgentSidebarData({
    selectedProjectId,
    selectedSessionId,
    sessionsRefreshNonce,
    setSelectedProject,
    setSelectedSessionId,
  });

  return (
    <Sider
      width={320}
      style={{
        background: token.colorBgContainer,
        borderRight: `1px solid ${token.colorBorderSecondary}`,
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <Flex
        vertical
        style={{
          height: "100%",
          padding: token.paddingSM,
          gap: token.paddingSM,
        }}
      >
        <Flex
          justify="space-between"
          align="center"
          style={{ gap: token.marginSM }}
        >
          <ModeSwitcher size="small" />
          <Flex style={{ gap: token.marginXS }}>
            <Button
              icon={<FolderOpenOutlined />}
              onClick={openProject}
              title="Open project"
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={loadProjects}
              loading={isLoadingProjects}
            />
          </Flex>
        </Flex>

        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects"
          allowClear
        />

        {error ? <Alert type="error" message={error} showIcon /> : null}

        <Flex vertical style={{ flex: 1, minHeight: 0, gap: token.paddingSM }}>
          <AgentSidebarProjectsCard
            projects={filteredProjects}
            menuItems={projectMenuItems}
            isLoading={isLoadingProjects}
            query={query}
            selectedProjectId={selectedProjectId}
            onSelectProject={(projectId) => {
              const project = filteredProjects.find((p) => p.id === projectId);
              if (project) {
                setSelectedProject(project.id, project.path);
              }
            }}
          />

          <AgentSidebarSessionsCard
            menuItems={sessionMenuItems}
            isLoading={isLoadingSessions}
            selectedProject={selectedProject}
            selectedProjectId={selectedProjectId}
            selectedSessionId={selectedSessionId}
            onSelectSession={setSelectedSessionId}
          />
        </Flex>
      </Flex>
    </Sider>
  );
};
