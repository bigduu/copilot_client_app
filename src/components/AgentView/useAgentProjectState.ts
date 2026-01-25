import { useCallback, useEffect, useMemo, useState } from "react";

import { claudeCodeService } from "../../services/ClaudeCodeService";
import { AgentSessionPersistenceService } from "../../services/AgentSessionPersistenceService";
import { serviceFactory } from "../../services/ServiceFactory";
import { getErrorMessage } from "./agentViewUtils";

import type {
  ClaudeProject,
  ClaudeSession,
} from "../../services/ClaudeCodeService";

type ProjectPathStatus = {
  valid: boolean | null;
  message?: string;
};

type UseAgentProjectStateArgs = {
  selectedProjectId: string | null;
  selectedProjectPath: string | null;
  sessionsRefreshNonce: number;
  setSelectedProjectPath: (path: string | null) => void;
  bumpSessionsRefreshNonce: () => void;
};

type UseAgentProjectStateResult = {
  projectsIndex: Map<string, ClaudeProject>;
  projects: ClaudeProject[];
  sessions: ClaudeSession[];
  isLoadingProjects: boolean;
  isLoadingSessions: boolean;
  projectsError: string | null;
  sessionsError: string | null;
  resolvedProjectPath: string | null;
  projectPathStatus: ProjectPathStatus;
  handleOpenProject: () => Promise<void>;
  refreshSessions: () => void;
};

export const useAgentProjectState = ({
  selectedProjectId,
  selectedProjectPath,
  sessionsRefreshNonce,
  setSelectedProjectPath,
  bumpSessionsRefreshNonce,
}: UseAgentProjectStateArgs): UseAgentProjectStateResult => {
  const [projectsIndex, setProjectsIndex] = useState<
    Map<string, ClaudeProject>
  >(new Map());
  const [projects, setProjects] = useState<ClaudeProject[]>([]);
  const [sessions, setSessions] = useState<ClaudeSession[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [projectPathStatus, setProjectPathStatus] = useState<ProjectPathStatus>(
    { valid: null },
  );

  const selectedProjectPathFromIndex = useMemo(() => {
    if (!selectedProjectId) return null;
    return projectsIndex.get(selectedProjectId)?.path ?? null;
  }, [projectsIndex, selectedProjectId]);

  const resolvedProjectPath = useMemo(
    () => selectedProjectPath ?? selectedProjectPathFromIndex,
    [selectedProjectPath, selectedProjectPathFromIndex],
  );

  useEffect(() => {
    if (!resolvedProjectPath) {
      setProjectPathStatus({ valid: null });
      return;
    }
    let active = true;
    setProjectPathStatus({ valid: null });
    void (async () => {
      try {
        await serviceFactory.invoke("list_directory_contents", {
          directoryPath: resolvedProjectPath,
        });
        if (!active) return;
        setProjectPathStatus({ valid: true });
      } catch (e) {
        if (!active) return;
        const message = getErrorMessage(e, "Project path not found");
        setProjectPathStatus({
          valid: false,
          message: message || "Project path not found",
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [resolvedProjectPath, getErrorMessage]);

  useEffect(() => {
    if (!selectedProjectId || selectedProjectPath) return;
    if (selectedProjectPathFromIndex) {
      setSelectedProjectPath(selectedProjectPathFromIndex);
    }
  }, [
    selectedProjectId,
    selectedProjectPath,
    selectedProjectPathFromIndex,
    setSelectedProjectPath,
  ]);

  const loadProjectsIndex = useCallback(async () => {
    setIsLoadingProjects(true);
    setProjectsError(null);
    try {
      const list = await claudeCodeService.listProjects();
      const map = new Map<string, ClaudeProject>();
      list.forEach((p) => map.set(p.id, p));
      setProjectsIndex(map);
      setProjects(list);
    } catch (e) {
      setProjectsError(getErrorMessage(e, "Failed to load projects"));
    } finally {
      setIsLoadingProjects(false);
    }
  }, [getErrorMessage]);

  useEffect(() => {
    loadProjectsIndex();
  }, [loadProjectsIndex, getErrorMessage]);

  const handleOpenProject = useCallback(async () => {
    setProjectsError(null);
    try {
      const path = await serviceFactory.invoke<string | null>("pick_folder");
      if (!path) return;
      await claudeCodeService.createProject(path);
      await loadProjectsIndex();
    } catch (e) {
      setProjectsError(getErrorMessage(e, "Failed to open project"));
    }
  }, [getErrorMessage, loadProjectsIndex]);

  const refreshSessions = useCallback(() => {
    bumpSessionsRefreshNonce();
  }, [bumpSessionsRefreshNonce]);

  useEffect(() => {
    if (!selectedProjectId) {
      setSessions([]);
      setSessionsError(null);
      setIsLoadingSessions(false);
      return;
    }
    setIsLoadingSessions(true);
    setSessionsError(null);
    void (async () => {
      try {
        const data =
          await claudeCodeService.listProjectSessions(selectedProjectId);
        setSessions(data);
        data.forEach((session) => {
          if (session.id && session.project_id && session.project_path) {
            AgentSessionPersistenceService.saveSession(
              session.id,
              session.project_id,
              session.project_path,
            );
          }
        });
      } catch (e) {
        const message = getErrorMessage(e, "Failed to load project sessions");
        setSessionsError(message || "Failed to load project sessions");
        setSessions([]);
      } finally {
        setIsLoadingSessions(false);
      }
    })();
  }, [selectedProjectId, sessionsRefreshNonce, getErrorMessage]);

  return {
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
  };
};
