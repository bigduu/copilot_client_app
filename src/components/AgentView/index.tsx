import React, { useCallback, useEffect, useState } from "react";
import { theme } from "antd";

import type {
  ClaudeProject,
  ClaudeSession,
} from "../../services/ClaudeCodeService";
import { useAgentStore } from "../../store/agentStore";
import { deriveProjectId } from "./agentViewUtils";
import { AgentViewChatRoute } from "./AgentViewChatRoute";
import { AgentViewProjectsRoute } from "./AgentViewProjectsRoute";
import { AgentViewSessionsRoute } from "./AgentViewSessionsRoute";
import { useAgentProjectState } from "./useAgentProjectState";
import { useAgentStreamState } from "./useAgentStreamState";

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
      <AgentViewProjectsRoute
        token={token}
        projects={projects}
        isLoadingProjects={isLoadingProjects}
        projectsError={projectsError}
        onOpenProject={handleOpenProject}
        onSelectProject={handleSelectProject}
      />
    );
  }

  if (agentPage === "sessions" && selectedProjectId) {
    return (
      <AgentViewSessionsRoute
        token={token}
        projects={projects}
        projectsIndex={projectsIndex}
        selectedProjectId={selectedProjectId}
        isLoadingProjects={isLoadingProjects}
        projectsError={projectsError}
        onOpenProject={handleOpenProject}
        onSelectProject={handleSelectProject}
        sessions={sessions}
        isLoadingSessions={isLoadingSessions}
        sessionsError={sessionsError}
        onBackToProjects={handleBackToProjects}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onRefresh={refreshSessions}
      />
    );
  }

  return (
    <AgentViewChatRoute
      token={token}
      resolvedProjectPath={resolvedProjectPath}
      runSessionId={runSessionId}
      selectedSessionId={selectedSessionId}
      queuedPrompts={queuedPrompts}
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
          ? (projects.find((p) => p.id === selectedProjectId)?.id ?? "Sessions")
          : null
      }
      projectPathStatus={projectPathStatus}
      error={error}
      history={history}
      liveEntries={liveEntries}
      outputText={outputText}
      mergedEntries={mergedEntries}
      liveTick={liveTick}
      onAskUserAnswer={handleAskUserAnswer}
      model={model}
      promptDraft={promptDraft}
      onModelChange={handleModelChange}
      onPromptChange={handlePromptChange}
      onSendPrompt={handleSendPrompt}
      onStartRun={startRun}
      onContinueRun={continueRun}
      onResumeRun={resumeRun}
      onRemoveQueuedPrompt={handleRemoveQueuedPrompt}
      toolsOpen={toolsOpen}
      toolsTab={toolsTab}
      onCloseTools={handleCloseTools}
      onToolsTabChange={handleToolsTabChange}
      selectedProjectId={selectedProjectId}
      deriveProjectId={deriveProjectId}
    />
  );
};
