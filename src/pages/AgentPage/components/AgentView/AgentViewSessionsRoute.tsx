import React from "react";
import { Layout } from "antd";

import type {
  ClaudeProject,
  ClaudeSession,
} from "../../services/ClaudeCodeService";
import { AgentProjectsPage } from "../AgentProjectsPage";
import { AgentSessionsPage } from "../AgentSessionsPage";

const { Content } = Layout;

type AgentViewSessionsRouteProps = {
  token: any;
  projects: ClaudeProject[];
  projectsIndex: Map<string, ClaudeProject>;
  selectedProjectId: string;
  isLoadingProjects: boolean;
  projectsError: string | null;
  onOpenProject: () => void;
  onSelectProject: (project: ClaudeProject) => void;
  onBack: () => void;
  sessions: ClaudeSession[];
  isLoadingSessions: boolean;
  sessionsError: string | null;
  onBackToProjects: () => void;
  onSelectSession: (session: ClaudeSession) => void;
  onNewSession: () => void;
  onRefresh: () => void;
};

export const AgentViewSessionsRoute: React.FC<AgentViewSessionsRouteProps> = ({
  token,
  projects,
  projectsIndex,
  selectedProjectId,
  isLoadingProjects,
  projectsError,
  onOpenProject,
  onSelectProject,
  onBack,
  sessions,
  isLoadingSessions,
  sessionsError,
  onBackToProjects,
  onSelectSession,
  onNewSession,
  onRefresh,
}) => {
  const project =
    projects.find((p) => p.id === selectedProjectId) ??
    projectsIndex.get(selectedProjectId);

  if (!project) {
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
          onBack={onBack}
        />
      </Content>
    );
  }

  return (
    <Content
      style={{
        height: "100vh",
        overflow: "hidden",
        background: token.colorBgContainer,
      }}
    >
      <AgentSessionsPage
        project={project}
        sessions={sessions}
        loading={isLoadingSessions}
        error={sessionsError}
        onBackToProjects={onBackToProjects}
        onSelectSession={onSelectSession}
        onNewSession={onNewSession}
        onRefresh={onRefresh}
      />
    </Content>
  );
};
