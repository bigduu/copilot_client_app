import React, { useCallback, useEffect, useState } from "react";
import { Alert, Flex, Layout, theme } from "antd";

import { useAgentStore } from "../../store/agentStore";
import { ClaudeStreamPanel } from "../ClaudeStream";
import { AgentChatView } from "../AgentChatView";
import { AgentProjectsPage } from "../AgentProjectsPage";
import { AgentSessionsPage } from "../AgentSessionsPage";
import { AgentHeader } from "./AgentHeader";
import { AgentInputPanel } from "./AgentInputPanel";
import { AgentToolsDrawer } from "./AgentToolsDrawer";
import { deriveProjectId } from "./agentViewUtils";
import { useAgentProjectState } from "./useAgentProjectState";
import { useAgentStreamState } from "./useAgentStreamState";

import type {
  ClaudeProject,
  ClaudeSession,
} from "../../services/ClaudeCodeService";

const { Content } = Layout;

export const AgentView: React.FC = () => {
  const { token } = theme.useToken();
  const selectedProjectId = useAgentStore((s) => s.selectedProjectId);
  const selectedProjectPath = useAgentStore((s) => s.selectedProjectPath);
  const selectedSessionId = useAgentStore((s) => s.selectedSessionId);
  const model = useAgentStore((s) => s.model);
  const promptDraft = useAgentStore((s) => s.promptDraft);

  const setPromptDraft = useAgentStore((s) => s.setPromptDraft);
  const setModel = useAgentStore((s) => s.setModel);
  const setSelectedProject = useAgentStore((s) => s.setSelectedProject);
  const setSelectedProjectPath = useAgentStore((s) => s.setSelectedProjectPath);
  const setSelectedSessionId = useAgentStore((s) => s.setSelectedSessionId);
  const sessionsRefreshNonce = useAgentStore((s) => s.sessionsRefreshNonce);
  const bumpSessionsRefreshNonce = useAgentStore(
    (s) => s.bumpSessionsRefreshNonce,
  );

  const [toolsOpen, setToolsOpen] = useState(false);
  const [toolsTab, setToolsTab] = useState<string>("timeline");
  const [agentPage, setAgentPage] = useState<"projects" | "sessions" | "chat">(
    () =>
      selectedProjectId
        ? selectedSessionId
          ? "chat"
          : "sessions"
        : "projects",
  );

  const {
    projectsIndex,
    projects,
    sessions,
    isLoadingProjects,
    isLoadingSessions,
    projectsError,
    sessionsError,
    resolvedProjectPath,
    projectPathStatus,
    handleOpenProject,
    refreshSessions,
  } = useAgentProjectState({
    selectedProjectId,
    selectedProjectPath,
    sessionsRefreshNonce,
    setSelectedProjectPath,
    bumpSessionsRefreshNonce,
  });

  const {
    history,
    liveEntries,
    liveLines,
    liveTick,
    outputText,
    mergedEntries,
    isRunning,
    runSessionId,
    error,
    view,
    queuedPrompts,
    handleViewChange,
    handleSendPrompt,
    handleAskUserAnswer,
    startRun,
    continueRun,
    resumeRun,
    cancelRun,
    handleRemoveQueuedPrompt,
    loadSessionHistory,
    clearChatState,
  } = useAgentStreamState({
    selectedProjectId,
    selectedSessionId,
    resolvedProjectPath,
    projectPathStatus,
    model,
    promptDraft,
    setPromptDraft,
    setSelectedProject,
    setSelectedSessionId,
    bumpSessionsRefreshNonce,
  });

  const handleOpenTools = useCallback(() => {
    setToolsOpen(true);
  }, []);

  const handleCloseTools = useCallback(() => {
    setToolsOpen(false);
  }, []);

  const handleToolsTabChange = useCallback((next: string) => {
    setToolsTab(next);
  }, []);

  const handleModelChange = useCallback(
    (value: string) => {
      setModel(value);
    },
    [setModel],
  );

  const handlePromptChange = useCallback(
    (value: string) => {
      setPromptDraft(value);
    },
    [setPromptDraft],
  );

  const handleSelectProject = useCallback(
    (project: ClaudeProject) => {
      clearChatState();
      setSelectedProject(project.id, project.path);
      setSelectedSessionId(null);
      setAgentPage("sessions");
    },
    [clearChatState, setSelectedProject, setSelectedSessionId],
  );

  const handleBackToProjects = useCallback(() => {
    clearChatState();
    setSelectedProject(null, null);
    setSelectedSessionId(null);
    setAgentPage("projects");
  }, [clearChatState, setSelectedProject, setSelectedSessionId]);

  const handleBackToSessions = useCallback(() => {
    clearChatState();
    if (!selectedProjectId) {
      setAgentPage("projects");
      return;
    }
    setAgentPage("sessions");
  }, [clearChatState, selectedProjectId]);

  const handleSelectSession = useCallback(
    (session: ClaudeSession) => {
      clearChatState();
      setSelectedSessionId(session.id);
      setAgentPage("chat");
    },
    [clearChatState, setSelectedSessionId],
  );

  const handleNewSession = useCallback(() => {
    clearChatState();
    setSelectedSessionId(null);
    setAgentPage("chat");
  }, [clearChatState, setSelectedSessionId]);

  useEffect(() => {
    if (!selectedProjectId) {
      setAgentPage("projects");
      return;
    }
    if (agentPage === "projects") {
      setAgentPage("sessions");
      return;
    }
    if (selectedSessionId && agentPage === "sessions") {
      setAgentPage("chat");
    }
  }, [agentPage, selectedProjectId, selectedSessionId]);

  if (agentPage === "projects") {
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
          onOpenProject={handleOpenProject}
          onSelectProject={handleSelectProject}
        />
      </Content>
    );
  }

  if (agentPage === "sessions" && selectedProjectId) {
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
            onOpenProject={handleOpenProject}
            onSelectProject={handleSelectProject}
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
          onBackToProjects={handleBackToProjects}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onRefresh={refreshSessions}
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
      <Flex
        vertical
        style={{
          height: "100%",
          padding: token.padding,
          gap: token.padding,
          overflow: "hidden",
        }}
      >
        <AgentHeader
          token={token}
          resolvedProjectPath={resolvedProjectPath}
          runSessionId={runSessionId}
          selectedSessionId={selectedSessionId}
          queuedCount={queuedPrompts.length}
          view={view}
          onViewChange={handleViewChange}
          onOpenTools={handleOpenTools}
          onReloadHistory={loadSessionHistory}
          onCancelRun={cancelRun}
          canReloadHistory={Boolean(selectedSessionId)}
          isRunning={isRunning}
          onGoProjects={handleBackToProjects}
          onGoSessions={selectedProjectId ? handleBackToSessions : undefined}
          projectLabel={
            selectedProjectId
              ? (projects.find((p) => p.id === selectedProjectId)?.id ??
                "Sessions")
              : null
          }
        />

        {projectPathStatus.valid === false ? (
          <Alert
            type="warning"
            message={projectPathStatus.message || "Project path not found"}
            showIcon
          />
        ) : null}

        {error ? <Alert type="error" message={error} showIcon /> : null}

        <div style={{ minHeight: 0, flex: 1, overflow: "hidden" }}>
          {view === "debug" ? (
            <Flex style={{ gap: token.padding, minHeight: 0, height: "100%" }}>
              <ClaudeStreamPanel
                title="Session History"
                entries={history}
                rawText={history.length ? JSON.stringify(history, null, 2) : ""}
              />

              <ClaudeStreamPanel
                title="Live Output"
                entries={liveEntries}
                rawText={outputText}
                autoScroll
              />
            </Flex>
          ) : (
            <AgentChatView
              entries={mergedEntries}
              autoScrollToken={`${selectedSessionId ?? "none"}-${liveTick}`}
              onAskUserAnswer={handleAskUserAnswer}
              isRunning={isRunning}
            />
          )}
        </div>

        <AgentInputPanel
          token={token}
          model={model}
          promptDraft={promptDraft}
          queuedPrompts={queuedPrompts}
          isRunning={isRunning}
          projectPathValid={projectPathStatus.valid === true}
          selectedSessionId={selectedSessionId}
          onModelChange={handleModelChange}
          onPromptChange={handlePromptChange}
          onSendPrompt={handleSendPrompt}
          onStartRun={startRun}
          onContinueRun={continueRun}
          onResumeRun={resumeRun}
          onRemoveQueuedPrompt={handleRemoveQueuedPrompt}
        />

        <AgentToolsDrawer
          open={toolsOpen}
          activeTab={toolsTab}
          onClose={handleCloseTools}
          onTabChange={handleToolsTabChange}
          sessionId={selectedSessionId}
          projectId={
            selectedProjectId ??
            deriveProjectId(resolvedProjectPath ?? undefined)
          }
          projectPath={resolvedProjectPath}
        />
      </Flex>
    </Content>
  );
};
