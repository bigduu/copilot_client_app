import { useCallback, useEffect, useMemo, useState } from "react";

import {
  claudeCodeService,
  ClaudeProject,
  ClaudeSession,
} from "../../services/ClaudeCodeService";
import { serviceFactory } from "../../services/ServiceFactory";

const getErrorMessage = (e: unknown, fallback: string) => {
  if (e instanceof Error) return e.message || fallback;
  if (typeof e === "string") return e || fallback;
  const message = (e as any)?.message;
  if (message) return String(message);
  try {
    return JSON.stringify(e);
  } catch {
    return fallback;
  }
};

type UseAgentSidebarDataArgs = {
  selectedProjectId: string | null;
  selectedSessionId: string | null;
  sessionsRefreshNonce: number;
  setSelectedProject: (id: string | null, path: string | null) => void;
  setSelectedSessionId: (id: string | null) => void;
};

export const useAgentSidebarData = ({
  selectedProjectId,
  selectedSessionId,
  sessionsRefreshNonce,
  setSelectedProject,
  setSelectedSessionId,
}: UseAgentSidebarDataArgs) => {
  const debugLog = useCallback((...args: any[]) => {
    if (!import.meta.env.DEV) return;
    console.log("[AgentSidebar]", ...args);
  }, []);

  const [projects, setProjects] = useState<ClaudeProject[]>([]);
  const [sessions, setSessions] = useState<ClaudeSession[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const loadProjects = useCallback(async () => {
    setIsLoadingProjects(true);
    setError(null);
    try {
      debugLog("loadProjects");
      const data = await claudeCodeService.listProjects();
      setProjects(data);
    } catch (e) {
      setError(getErrorMessage(e, "Failed to load Claude projects"));
    } finally {
      setIsLoadingProjects(false);
    }
  }, [debugLog]);

  const openProject = useCallback(async () => {
    setError(null);
    try {
      const path = await serviceFactory.invoke<string | null>("pick_folder");
      if (!path) return;
      await claudeCodeService.createProject(path);
      await loadProjects();
    } catch (e) {
      setError(getErrorMessage(e, "Failed to open project"));
    }
  }, [loadProjects]);

  const loadSessions = useCallback(
    async (projectId: string) => {
      setIsLoadingSessions(true);
      setError(null);
      try {
        debugLog("loadSessions", { projectId });
        const data = await claudeCodeService.listProjectSessions(projectId);
        setSessions(data);
      } catch (e) {
        const message = getErrorMessage(e, "Failed to load project sessions");
        setError(message || "Failed to load project sessions");
        setSessions([]);
      } finally {
        setIsLoadingSessions(false);
      }
    },
    [debugLog],
  );

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (!selectedProjectId) {
      setSessions([]);
      return;
    }
    loadSessions(selectedProjectId);
  }, [loadSessions, selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId) return;
    if (!sessions.length) return;
    if (selectedSessionId) return;
    setSelectedSessionId(sessions[0].id);
  }, [selectedProjectId, selectedSessionId, sessions, setSelectedSessionId]);

  useEffect(() => {
    if (!selectedProjectId) return;
    debugLog("sessionsRefreshNonce changed", sessionsRefreshNonce);
    loadSessions(selectedProjectId);
  }, [debugLog, loadSessions, selectedProjectId, sessionsRefreshNonce]);

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => {
      return p.id.toLowerCase().includes(q) || p.path.toLowerCase().includes(q);
    });
  }, [projects, query]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const projectMenuItems = useMemo(
    () =>
      filteredProjects.map((item) => ({
        key: item.id,
        label: item,
      })),
    [filteredProjects],
  );

  const sessionMenuItems = useMemo(
    () =>
      sessions.map((item) => ({
        key: item.id,
        label: item,
      })),
    [sessions],
  );

  return {
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
    sessions,
    setQuery,
    setSelectedProject,
    setSelectedSessionId,
  };
};
