import React from "react";
import { Layout } from "antd";

import type { ClaudeProject } from "../../services/ClaudeCodeService";
import { AgentProjectsPage } from "../AgentProjectsPage";

const { Content } = Layout;

type AgentViewProjectsRouteProps = {
  token: any;
  projects: ClaudeProject[];
  isLoadingProjects: boolean;
  projectsError: string | null;
  onOpenProject: () => void;
  onSelectProject: (project: ClaudeProject) => void;
};

export const AgentViewProjectsRoute: React.FC<AgentViewProjectsRouteProps> = ({
  token,
  projects,
  isLoadingProjects,
  projectsError,
  onOpenProject,
  onSelectProject,
}) => {
  return (
    <Content
      style={{
        height: "100vh",
        overflow: "hidden",
        background: token.colorBgContainer,
      }}
    >
      <AgentProjectsPage
        projects={projects}
        loading={isLoadingProjects}
        error={projectsError}
        onOpenProject={onOpenProject}
        onSelectProject={onSelectProject}
      />
    </Content>
  );
};
