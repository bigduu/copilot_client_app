import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Card,
  Empty,
  Layout,
  Button,
  Flex,
  Input,
  Menu,
  Spin,
  Typography,
  theme,
} from "antd";
import { FolderOpenOutlined, ReloadOutlined } from "@ant-design/icons";

import {
  claudeCodeService,
  ClaudeProject,
  ClaudeSession,
} from "../../services/ClaudeCodeService";
import { useAgentStore } from "../../store/agentStore";
import { ModeSwitcher } from "../ModeSwitcher";
import { serviceFactory } from "../../services/ServiceFactory";

const { Sider } = Layout;
const { Text } = Typography;

export const AgentSidebar: React.FC = () => {
  const { token } = theme.useToken();
  const selectedProjectId = useAgentStore((s) => s.selectedProjectId);
  const selectedSessionId = useAgentStore((s) => s.selectedSessionId);
  const sessionsRefreshNonce = useAgentStore((s) => s.sessionsRefreshNonce);
  const setSelectedProject = useAgentStore((s) => s.setSelectedProject);
  const setSelectedSessionId = useAgentStore((s) => s.setSelectedSessionId);

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
      setError(
        e instanceof Error ? e.message : "Failed to load Claude projects",
      );
    } finally {
      setIsLoadingProjects(false);
    }
  }, []);

  const openProject = useCallback(async () => {
    setError(null);
    try {
      const path = await serviceFactory.invoke<string | null>("pick_folder");
      if (!path) return;
      await claudeCodeService.createProject(path);
      await loadProjects();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open project");
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
        const message =
          e instanceof Error
            ? e.message
            : typeof e === "string"
              ? e
              : (e as any)?.message
                ? String((e as any).message)
                : JSON.stringify(e);
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
  }, [loadSessions, selectedProjectId, sessionsRefreshNonce]);

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
        label: (
          <Flex vertical style={{ minWidth: 0 }}>
            <Text ellipsis>{item.path}</Text>
            <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
              {item.id}
            </Text>
          </Flex>
        ),
      })),
    [filteredProjects],
  );

  const sessionMenuItems = useMemo(
    () =>
      sessions.map((item) => ({
        key: item.id,
        label: (
          <Flex vertical style={{ minWidth: 0 }}>
            <Text ellipsis>{item.first_message || item.id}</Text>
            <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
              {item.id}
            </Text>
          </Flex>
        ),
      })),
    [sessions],
  );

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
          <Card
            size="small"
            title="Projects"
            styles={{ body: { padding: 0, minHeight: 0 } }}
            style={{ minHeight: 0, flex: 1 }}
          >
            <Spin spinning={isLoadingProjects}>
              {filteredProjects.length ? (
                <div style={{ maxHeight: "100%", overflow: "auto" }}>
                  <Menu
                    mode="inline"
                    selectedKeys={selectedProjectId ? [selectedProjectId] : []}
                    items={projectMenuItems}
                    onSelect={(info) => {
                      const project = projects.find((p) => p.id === info.key);
                      if (project) {
                        setSelectedProject(project.id, project.path);
                      }
                    }}
                    style={{
                      borderInlineEnd: "none",
                      background: "transparent",
                    }}
                  />
                </div>
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <Text type="secondary">
                      {query ? "No matches" : "No projects"}
                    </Text>
                  }
                />
              )}
            </Spin>
          </Card>

          <Card
            size="small"
            title="Sessions"
            styles={{ body: { padding: 0, minHeight: 0 } }}
            style={{ minHeight: 0, flex: 1 }}
          >
            <Text
              type="secondary"
              style={{ display: "block", padding: "0 12px" }}
            >
              {selectedProject ? selectedProject.path : "Select a project"}
            </Text>
            <Spin spinning={isLoadingSessions}>
              {sessions.length ? (
                <div style={{ maxHeight: "100%", overflow: "auto" }}>
                  <Menu
                    mode="inline"
                    selectedKeys={selectedSessionId ? [selectedSessionId] : []}
                    items={sessionMenuItems}
                    onSelect={(info) => setSelectedSessionId(info.key)}
                    style={{
                      borderInlineEnd: "none",
                      background: "transparent",
                    }}
                  />
                </div>
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <Text type="secondary">
                      {selectedProjectId
                        ? "No sessions"
                        : "Select a project first"}
                    </Text>
                  }
                />
              )}
            </Spin>
          </Card>
        </Flex>
      </Flex>
    </Sider>
  );
};
