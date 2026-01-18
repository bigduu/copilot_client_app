import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Layout, Button, Flex, Input, List, Typography, theme } from "antd"
import { ReloadOutlined } from "@ant-design/icons"

import { serviceFactory } from "../../services/ServiceFactory"
import { useAgentStore } from "../../store/agentStore"
import { ModeSwitcher } from "../ModeSwitcher"

const { Sider } = Layout
const { Text } = Typography

export interface ClaudeProject {
  id: string
  path: string
  sessions: string[]
  created_at: number
  most_recent_session: number | null
}

export interface ClaudeSession {
  id: string
  project_id: string
  project_path: string
  created_at: number
  modified_at: number
  first_message: string | null
  message_timestamp: string | null
}

export const AgentSidebar: React.FC = () => {
  const { token } = theme.useToken()
  const selectedProjectId = useAgentStore((s) => s.selectedProjectId)
  const selectedSessionId = useAgentStore((s) => s.selectedSessionId)
  const sessionsRefreshNonce = useAgentStore((s) => s.sessionsRefreshNonce)
  const setSelectedProjectId = useAgentStore((s) => s.setSelectedProjectId)
  const setSelectedSessionId = useAgentStore((s) => s.setSelectedSessionId)

  const debugLog = useCallback((...args: any[]) => {
    if (!import.meta.env.DEV) return
    // eslint-disable-next-line no-console -- dev-only debug trace
    console.log("[AgentSidebar]", ...args)
  }, [])

  const [projects, setProjects] = useState<ClaudeProject[]>([])
  const [sessions, setSessions] = useState<ClaudeSession[]>([])
  const [isLoadingProjects, setIsLoadingProjects] = useState(false)
  const [isLoadingSessions, setIsLoadingSessions] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  const loadProjects = useCallback(async () => {
    setIsLoadingProjects(true)
    setError(null)
    try {
      debugLog("loadProjects")
      const data = await serviceFactory.invoke<ClaudeProject[]>(
        "list_claude_projects",
      )
      setProjects(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Claude projects")
    } finally {
      setIsLoadingProjects(false)
    }
  }, [])

  const loadSessions = useCallback(async (projectId: string) => {
    setIsLoadingSessions(true)
    setError(null)
    try {
      debugLog("loadSessions", { projectId })
      const data = await serviceFactory.invoke<ClaudeSession[]>(
        "list_project_sessions",
        { projectId },
      )
      setSessions(data)
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : (e as any)?.message
              ? String((e as any).message)
              : JSON.stringify(e)
      setError(message || "Failed to load project sessions")
      setSessions([])
    } finally {
      setIsLoadingSessions(false)
    }
  }, [debugLog])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  useEffect(() => {
    if (!selectedProjectId) {
      setSessions([])
      return
    }
    loadSessions(selectedProjectId)
  }, [loadSessions, selectedProjectId])

  useEffect(() => {
    if (!selectedProjectId) return
    debugLog("sessionsRefreshNonce changed", sessionsRefreshNonce)
    loadSessions(selectedProjectId)
  }, [loadSessions, selectedProjectId, sessionsRefreshNonce])

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return projects
    return projects.filter((p) => {
      return (
        p.id.toLowerCase().includes(q) || p.path.toLowerCase().includes(q)
      )
    })
  }, [projects, query])

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  )

  return (
    <Sider
      width={320}
      style={{
        background: "var(--ant-color-bg-container)",
        borderRight: "1px solid var(--ant-color-border)",
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
        <Flex justify="space-between" align="center" style={{ gap: token.marginSM }}>
          <ModeSwitcher size="small" />
          <Button
            icon={<ReloadOutlined />}
            onClick={loadProjects}
            loading={isLoadingProjects}
          />
        </Flex>

        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects"
          allowClear
        />

        {error ? (
          <Text type="danger" style={{ display: "block" }}>
            {error}
          </Text>
        ) : null}

        <Flex vertical style={{ flex: 1, minHeight: 0, gap: token.paddingSM }}>
          <Flex vertical style={{ flex: 1, minHeight: 0 }}>
            <Text strong>Projects</Text>
            <div style={{ overflow: "auto", minHeight: 0 }}>
              <List
                size="small"
                loading={isLoadingProjects}
                dataSource={filteredProjects}
                renderItem={(item) => {
                  const isSelected = item.id === selectedProjectId
                  return (
                    <List.Item
                      style={{
                        cursor: "pointer",
                        borderRadius: token.borderRadius,
                        padding: token.paddingXS,
                        background: isSelected
                          ? "var(--ant-color-bg-elevated)"
                          : "transparent",
                      }}
                      onClick={() => setSelectedProjectId(item.id)}
                    >
                      <Flex vertical style={{ width: "100%" }}>
                        <Text ellipsis>{item.path}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
                          {item.id}
                        </Text>
                      </Flex>
                    </List.Item>
                  )
                }}
              />
            </div>
          </Flex>

          <Flex vertical style={{ flex: 1, minHeight: 0 }}>
            <Text strong>Sessions</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {selectedProject ? selectedProject.path : "Select a project"}
            </Text>
            <div style={{ overflow: "auto", minHeight: 0 }}>
              <List
                size="small"
                loading={isLoadingSessions}
                dataSource={sessions}
                locale={{
                  emptyText: selectedProjectId
                    ? "No sessions"
                    : "Select a project first",
                }}
                renderItem={(item) => {
                  const isSelected = item.id === selectedSessionId
                  return (
                    <List.Item
                      style={{
                        cursor: "pointer",
                        borderRadius: token.borderRadius,
                        padding: token.paddingXS,
                        background: isSelected
                          ? "var(--ant-color-bg-elevated)"
                          : "transparent",
                      }}
                      onClick={() => setSelectedSessionId(item.id)}
                    >
                      <Flex vertical style={{ width: "100%" }}>
                        <Text ellipsis>{item.first_message || item.id}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
                          {item.id}
                        </Text>
                      </Flex>
                    </List.Item>
                  )
                }}
              />
            </div>
          </Flex>
        </Flex>
      </Flex>
    </Sider>
  )
}
