import React, { useCallback, useEffect, useMemo, useState } from "react";
import { theme } from "antd";

import type {
  ClaudeProject,
  ClaudeSession,
} from "../../services/ClaudeCodeService";
import { useAgentStore } from "../../store/agentStore";
import { useUiModeStore } from "../../../../shared/store/uiModeStore";
import { AgentSessionPersistenceService } from "../../services/AgentSessionPersistenceService";
import { deriveProjectId, extractSessionId } from "./agentViewUtils";
import { AgentViewChatRoute } from "./AgentViewChatRoute";
import { AgentViewProjectsRoute } from "./AgentViewProjectsRoute";
import { AgentViewSessionsRoute } from "./AgentViewSessionsRoute";
import { useAgentProjectState } from "./useAgentProjectState";
import { useAgentStreamState } from "./useAgentStreamState";

export const AgentView: React.FC = () => {
  const { token } = theme.useToken();
  const setMode = useUiModeStore((s) => s.setMode);
  const selectedProjectId = useAgentStore((s) => s.selectedProjectId);
  const selectedProjectPath = useAgentStore((s) => s.selectedProjectPath);
  const selectedSessionId = useAgentStore((s) => s.selectedSessionId);
  const model = useAgentStore((s) => s.model);
  const thinkingMode = useAgentStore((s) => s.thinkingMode);
  const promptDraft = useAgentStore((s) => s.promptDraft);

  const setPromptDraft = useAgentStore((s) => s.setPromptDraft);
  const setModel = useAgentStore((s) => s.setModel);
  const setThinkingMode = useAgentStore((s) => s.setThinkingMode);
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
  const [openedSessionIds, setOpenedSessionIds] = useState<string[]>([]);
  const [lastAgentContext, setLastAgentContext] = useState<{
    projectId: string | null;
    projectPath: string | null;
    sessionId: string | null;
  } | null>(null);

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
    runningSessions,
    runningSessionIds,
    handleViewChange,
    handleSendPrompt,
    handleAskUserAnswer,
    startRun,
    continueRun,
    resumeRun,
    cancelRun,
    handleRemoveQueuedPrompt,
    loadSessionHistory,
    switchSession,
    clearChatState,
  } = useAgentStreamState({
    selectedProjectId,
    selectedSessionId,
    resolvedProjectPath,
    projectPathStatus,
    model,
    thinkingMode,
    promptDraft,
    setPromptDraft,
    setSelectedProject,
    setSelectedSessionId,
    bumpSessionsRefreshNonce,
    sessionsRefreshNonce,
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

  const handleThinkingModeChange = useCallback(
    (value: string) => {
      setThinkingMode(value);
    },
    [setThinkingMode],
  );

  const handlePromptChange = useCallback(
    (value: string) => {
      setPromptDraft(value);
    },
    [setPromptDraft],
  );

  useEffect(() => {
    const stored = AgentSessionPersistenceService.getOpenedSessionIds();
    if (stored.length) {
      setOpenedSessionIds(stored);
    }
  }, []);

  useEffect(() => {
    if (!selectedSessionId) return;
    setOpenedSessionIds((prev) =>
      prev.includes(selectedSessionId) ? prev : [...prev, selectedSessionId],
    );
  }, [selectedSessionId]);

  useEffect(() => {
    AgentSessionPersistenceService.setOpenedSessionIds(openedSessionIds);
  }, [openedSessionIds]);

  const sessionTabs = useMemo(() => {
    const resolveProjectName = (
      path?: string | null,
      projectId?: string | null,
    ) => {
      if (path) {
        const parts = path.split("/").filter(Boolean);
        return parts[parts.length - 1] || projectId || "Project";
      }
      if (projectId) {
        const project = projects.find((p) => p.id === projectId);
        if (project?.path) {
          const parts = project.path.split("/").filter(Boolean);
          return parts[parts.length - 1] || projectId;
        }
        return projectId;
      }
      return "Project";
    };

    const tabs: Array<{
      key: string;
      label: string;
      running: boolean;
      isProject?: boolean;
    }> = [{ key: "projects", label: "Projects", running: false, isProject: true }];
    const runningSorted = [...runningSessions].sort((a, b) => {
      const aTime = new Date(a.started_at ?? a.startedAt ?? 0).getTime();
      const bTime = new Date(b.started_at ?? b.startedAt ?? 0).getTime();
      return bTime - aTime;
    });
    const runningIds = new Set(runningSessionIds);

    const sessionLabel = (
      sessionId: string,
      projectPath?: string | null,
      projectId?: string | null,
    ) => {
      const projectName = resolveProjectName(projectPath, projectId);
      return `${projectName} · ${sessionId.slice(-8)}`;
    };

    runningSorted.forEach((info) => {
      const id = extractSessionId(info);
      if (!id) return;
      const projectPath = info.project_path ?? info.projectPath ?? null;
      tabs.push({
        key: id,
        label: sessionLabel(id, projectPath),
        running: true,
      });
    });

    const nonRunningOpened = openedSessionIds.filter(
      (id) => !runningIds.has(id),
    );
    nonRunningOpened.forEach((sessionId) => {
      const cached = AgentSessionPersistenceService.loadSession(sessionId);
      const isActive = sessionId === selectedSessionId;
      const projectPath =
        cached?.projectPath ??
        (isActive ? resolvedProjectPath ?? selectedProjectPath : null);
      tabs.push({
        key: sessionId,
        label: sessionLabel(sessionId, projectPath, cached?.projectId),
        running: false,
      });
    });

    return tabs;
  }, [
    openedSessionIds,
    projects,
    resolvedProjectPath,
    runningSessionIds,
    runningSessions,
    selectedProjectId,
    selectedProjectPath,
    selectedSessionId,
  ]);

  const activeSessionTab = selectedSessionId ?? "projects";

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
    if (selectedProjectId) {
      setLastAgentContext({
        projectId: selectedProjectId,
        projectPath: selectedProjectPath ?? resolvedProjectPath ?? null,
        sessionId: selectedSessionId,
      });
    }
    setSelectedProject(null, null);
    setSelectedSessionId(null);
    setAgentPage("projects");
  }, [
    clearChatState,
    resolvedProjectPath,
    selectedProjectId,
    selectedProjectPath,
    selectedSessionId,
    setSelectedProject,
    setSelectedSessionId,
  ]);

  const handleBackFromProjects = useCallback(() => {
    if (lastAgentContext?.sessionId) {
      setAgentPage("chat");
      void switchSession(lastAgentContext.sessionId, {
        projectId: lastAgentContext.projectId,
        projectPath: lastAgentContext.projectPath,
      });
      return;
    }
    if (lastAgentContext?.projectId) {
      clearChatState();
      setSelectedProject(
        lastAgentContext.projectId,
        lastAgentContext.projectPath,
      );
      setSelectedSessionId(null);
      setAgentPage("sessions");
      return;
    }
    setMode("chat");
  }, [
    clearChatState,
    lastAgentContext,
    setMode,
    setSelectedProject,
    setSelectedSessionId,
    switchSession,
  ]);

  const handleSelectSessionTab = useCallback(
    async (key: string) => {
      if (key === "projects") {
        handleBackToProjects();
        return;
      }
      const cached = AgentSessionPersistenceService.loadSession(key);
      await switchSession(
        key,
        cached
          ? { projectId: cached.projectId, projectPath: cached.projectPath }
          : undefined,
      );
    },
    [handleBackToProjects, switchSession],
  );

  const handleSelectSession = useCallback(
    (session: ClaudeSession) => {
      setAgentPage("chat");
      if (session.project_id && session.project_path) {
        AgentSessionPersistenceService.saveSession(
          session.id,
          session.project_id,
          session.project_path,
        );
      }
      void switchSession(session.id, {
        projectId: session.project_id,
        projectPath: session.project_path,
      });
    },
    [switchSession],
  );

  const handleNewSession = useCallback(() => {
    setAgentPage("chat");
    void switchSession(null);
  }, [switchSession]);

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
        onBack={handleBackFromProjects}
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
        onBack={handleBackFromProjects}
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
      sessionTabs={sessionTabs}
      activeSessionTab={activeSessionTab}
      onSessionTabChange={handleSelectSessionTab}
      onReloadHistory={loadSessionHistory}
      onCancelRun={cancelRun}
      canReloadHistory={Boolean(selectedSessionId)}
      isRunning={isRunning}
      projectPathStatus={projectPathStatus}
      error={error}
      history={history}
      liveEntries={liveEntries}
      outputText={outputText}
      mergedEntries={mergedEntries}
      liveTick={liveTick}
      onAskUserAnswer={handleAskUserAnswer}
      model={model}
      thinkingMode={thinkingMode}
      promptDraft={promptDraft}
      onModelChange={handleModelChange}
      onThinkingModeChange={handleThinkingModeChange}
      onPromptChange={handlePromptChange}
      onSendPrompt={handleSendPrompt}
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
