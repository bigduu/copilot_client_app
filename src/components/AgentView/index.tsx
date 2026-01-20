import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { listen } from "@tauri-apps/api/event"
import {
  Alert,
  Badge,
  Button,
  Card,
  AutoComplete,
  Drawer,
  Flex,
  Input,
  Layout,
  List,
  Tabs,
  Tag,
  Typography,
  theme,
} from "antd"
import { ToolOutlined } from "@ant-design/icons"

import {
  claudeCodeService,
  ClaudeProject,
} from "../../services/ClaudeCodeService"
import { useAgentStore } from "../../store/agentStore"
import { ClaudeStreamPanel } from "../ClaudeStream"
import type { ClaudeStreamMessage } from "../ClaudeStream"
import { AgentChatView } from "../AgentChatView"
import { AgentSessionPersistenceService } from "../../services/AgentSessionPersistenceService"
import { TimelinePanel } from "../AgentTools/TimelinePanel"
import { SlashCommandsPanel } from "../AgentTools/SlashCommandsPanel"
import { PreviewPanel } from "../AgentTools/PreviewPanel"
import { ClaudeInstallPanel } from "../ClaudeInstallPanel"
import { serviceFactory } from "../../services/ServiceFactory"
import "./styles.css"

const { Content } = Layout
const { Text } = Typography
type QueuedPrompt = { id: string; prompt: string; model: string }

export const AgentView: React.FC = () => {
  const debugLog = useCallback((...args: any[]) => {
    if (!import.meta.env.DEV) return
    console.log("[AgentView]", ...args)
  }, [])

  const { token } = theme.useToken()
  const selectedProjectId = useAgentStore((s) => s.selectedProjectId)
  const selectedProjectPath = useAgentStore((s) => s.selectedProjectPath)
  const selectedSessionId = useAgentStore((s) => s.selectedSessionId)
  const model = useAgentStore((s) => s.model)
  const promptDraft = useAgentStore((s) => s.promptDraft)

  const setPromptDraft = useAgentStore((s) => s.setPromptDraft)
  const setModel = useAgentStore((s) => s.setModel)
  const setSelectedProject = useAgentStore((s) => s.setSelectedProject)
  const setSelectedProjectPath = useAgentStore((s) => s.setSelectedProjectPath)
  const setSelectedSessionId = useAgentStore((s) => s.setSelectedSessionId)
  const bumpSessionsRefreshNonce = useAgentStore((s) => s.bumpSessionsRefreshNonce)

  const [projectsIndex, setProjectsIndex] = useState<Map<string, ClaudeProject>>(
    new Map(),
  )
  const [history, setHistory] = useState<ClaudeStreamMessage[]>([])
  const [liveEntries, setLiveEntries] = useState<ClaudeStreamMessage[]>([])
  const [liveLines, setLiveLines] = useState<string[]>([])
  const [liveTick, setLiveTick] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const [runSessionId, setRunSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<"chat" | "debug">("chat")
  const [queuedPrompts, setQueuedPrompts] = useState<QueuedPrompt[]>([])
  const [toolsOpen, setToolsOpen] = useState(false)
  const [toolsTab, setToolsTab] = useState<string>("timeline")
  const [projectPathStatus, setProjectPathStatus] = useState<{
    valid: boolean | null
    message?: string
  }>({ valid: null })

  const clearPromptDraft = useCallback(() => {
    setPromptDraft("")
  }, [setPromptDraft])

  const viewRef = useRef(view)
  const unlistenGenericRef = useRef<Array<() => void>>([])
  const unlistenScopedRef = useRef<Array<() => void>>([])
  const runSessionIdRef = useRef<string | null>(null)
  const isMountedRef = useRef(true)
  const outputLineCountRef = useRef(0)
  const sawAssistantRef = useRef(false)

  const pendingLinesRef = useRef<string[]>([])
  const liveLinesBufferRef = useRef<string[]>([])
  const liveMapRef = useRef<Map<string, ClaudeStreamMessage>>(new Map())
  const liveOrderRef = useRef<string[]>([])
  const flushTimerRef = useRef<number | null>(null)
  const seqRef = useRef(0)
  const partialTextRef = useRef<Map<string, string>>(new Map())
  const runNextQueuedPromptRef = useRef<() => void>(() => {})

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const cleanupListeners = useCallback(() => {
    unlistenGenericRef.current.forEach((u) => u())
    unlistenGenericRef.current = []
    unlistenScopedRef.current.forEach((u) => u())
    unlistenScopedRef.current = []
  }, [])

  useEffect(() => cleanupListeners, [cleanupListeners])

  const selectedProjectPathFromIndex = useMemo(() => {
    if (!selectedProjectId) return null
    return projectsIndex.get(selectedProjectId)?.path ?? null
  }, [projectsIndex, selectedProjectId])

  const resolvedProjectPath = useMemo(
    () => selectedProjectPath ?? selectedProjectPathFromIndex,
    [selectedProjectPath, selectedProjectPathFromIndex],
  )

  useEffect(() => {
    if (!resolvedProjectPath) {
      setProjectPathStatus({ valid: null })
      return
    }
    let active = true
    setProjectPathStatus({ valid: null })
    void (async () => {
      try {
        await serviceFactory.invoke("list_directory_contents", {
          directoryPath: resolvedProjectPath,
        })
        if (!active) return
        setProjectPathStatus({ valid: true })
      } catch (e) {
        if (!active) return
        const message =
          e instanceof Error
            ? e.message
            : typeof e === "string"
              ? e
              : (e as any)?.message
                ? String((e as any).message)
                : JSON.stringify(e)
        setProjectPathStatus({
          valid: false,
          message: message || "Project path not found",
        })
      }
    })()
    return () => {
      active = false
    }
  }, [resolvedProjectPath])

  useEffect(() => {
    if (!selectedProjectId || selectedProjectPath) return
    if (selectedProjectPathFromIndex) {
      setSelectedProjectPath(selectedProjectPathFromIndex)
    }
  }, [
    selectedProjectId,
    selectedProjectPath,
    selectedProjectPathFromIndex,
    setSelectedProjectPath,
  ])

  const deriveProjectId = useCallback((path?: string | null) => {
    if (!path) return ""
    return path.replace(/[^a-zA-Z0-9]/g, "-")
  }, [])

  const loadProjectsIndex = useCallback(async () => {
    try {
      const list = await claudeCodeService.listProjects()
      const map = new Map<string, ClaudeProject>()
      list.forEach((p) => map.set(p.id, p))
      setProjectsIndex(map)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load projects")
    }
  }, [])

  useEffect(() => {
    loadProjectsIndex()
  }, [loadProjectsIndex])

  const extractSessionId = useCallback((info: any): string | null => {
    const pt = info?.process_type ?? info?.processType
    if (!pt) return null
    if (pt.ClaudeSession?.session_id) return pt.ClaudeSession.session_id
    if (pt.ClaudeSession?.sessionId) return pt.ClaudeSession.sessionId
    if (pt.session_id) return pt.session_id
    if (pt.sessionId) return pt.sessionId
    return null
  }, [])

  const loadSessionHistory = useCallback(async (): Promise<number> => {
    if (!selectedProjectId || !selectedSessionId) {
      return 0
    }

    setError(null)
    try {
      const entries = await claudeCodeService.loadSessionHistory(
        selectedProjectId,
        selectedSessionId,
      )
      debugLog("loadSessionHistory(ok)", {
        projectId: selectedProjectId,
        sessionId: selectedSessionId,
        count: entries.length,
        types: entries.slice(0, 6).map((e: any) => e?.type).filter(Boolean),
      })
      setHistory(entries as ClaudeStreamMessage[])
      return entries.length
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : (e as any)?.message
              ? String((e as any).message)
              : JSON.stringify(e)
      setError(message || "Failed to load session history")
      return 0
    }
  }, [debugLog, selectedProjectId, selectedSessionId])

  const loadSessionHistoryFor = useCallback(
    async (projectId: string, sessionId: string): Promise<number> => {
      if (!projectId || !sessionId) return 0
      setError(null)
      try {
        const entries = await claudeCodeService.loadSessionHistory(
          projectId,
          sessionId,
        )
        setHistory(entries as ClaudeStreamMessage[])
        return entries.length
      } catch (e) {
        const message =
          e instanceof Error
            ? e.message
            : typeof e === "string"
              ? e
              : (e as any)?.message
                ? String((e as any).message)
                : JSON.stringify(e)
        setError(message || "Failed to load session history")
        return 0
      }
    },
    [],
  )

  useEffect(() => {
    if (isRunning) return
    void loadSessionHistory()
  }, [isRunning, loadSessionHistory])

  useEffect(() => {
    debugLog("state", {
      selectedProjectId,
      selectedSessionId,
      runSessionId,
      isRunning,
      view,
    })
  }, [debugLog, isRunning, runSessionId, selectedProjectId, selectedSessionId, view])

  useEffect(() => {
    viewRef.current = view
    if (view === "debug") {
      setLiveLines([...liveLinesBufferRef.current])
    }
  }, [view])

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current !== null) return
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null
      if (!isMountedRef.current) return

      if (pendingLinesRef.current.length) {
        const next = pendingLinesRef.current.splice(0, pendingLinesRef.current.length)
        const merged = [...liveLinesBufferRef.current, ...next]
        liveLinesBufferRef.current = merged.length > 2000 ? merged.slice(-2000) : merged
        if (viewRef.current === "debug") {
          setLiveLines([...liveLinesBufferRef.current])
        }
      }

      const order = liveOrderRef.current
      const map = liveMapRef.current
      const entries = order.map((k) => map.get(k)).filter(Boolean) as ClaudeStreamMessage[]
      setLiveEntries(entries.length > 800 ? entries.slice(-800) : entries)
      setLiveTick((t) => t + 1)
    }, 75)
  }, [])

  const upsertLiveEntry = useCallback(
    (key: string, entry: ClaudeStreamMessage) => {
      const map = liveMapRef.current
      if (!map.has(key)) {
        liveOrderRef.current.push(key)
      }
      map.set(key, entry)
      if (liveOrderRef.current.length > 1200) {
        const drop = liveOrderRef.current.splice(0, liveOrderRef.current.length - 1000)
        drop.forEach((k) => map.delete(k))
      }
    },
    [],
  )

  const resetLiveState = useCallback(() => {
    pendingLinesRef.current = []
    liveLinesBufferRef.current = []
    liveMapRef.current.clear()
    liveOrderRef.current = []
    partialTextRef.current.clear()
    setLiveLines([])
    setLiveEntries([])
    setLiveTick((t) => t + 1)
  }, [])

  const resetRunSignals = useCallback(() => {
    outputLineCountRef.current = 0
    sawAssistantRef.current = false
  }, [])

  const enqueuePrompt = useCallback((prompt: string, modelName: string) => {
    const item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      prompt,
      model: modelName,
    }
    setQueuedPrompts((prev) => [...prev, item])
  }, [])

  const updateLocalPromptSessionId = useCallback(
    (sid: string) => {
      const map = liveMapRef.current
      liveOrderRef.current.forEach((k) => {
        const e: any = map.get(k)
        if (e?.local_prompt && !(e.session_id ?? e.sessionId)) {
          map.set(k, { ...e, sessionId: sid })
        }
      })
      scheduleFlush()
    },
    [scheduleFlush],
  )

  const appendOutputLine = useCallback(
    (line: string) => {
      if (!isMountedRef.current) return
      outputLineCountRef.current += 1
      pendingLinesRef.current.push(line)

      try {
        const parsed: any = JSON.parse(line)
        const rawType = parsed?.type
        const sid =
          parsed?.session_id ??
          parsed?.sessionId ??
          runSessionIdRef.current ??
          selectedSessionId ??
          undefined

        if (rawType === "partial") {
          sawAssistantRef.current = true
          const key = `partial:${sid ?? "unknown"}`
          const existing = partialTextRef.current.get(key) ?? ""
          const prevEntry: any = liveMapRef.current.get(key)
          const chunk =
            typeof parsed?.content === "string"
              ? parsed.content
              : typeof parsed?.message?.content === "string"
                ? parsed.message.content
                : ""

          const next =
            chunk && chunk.startsWith(existing) ? chunk : existing + (chunk ?? "")
          partialTextRef.current.set(key, next)
          upsertLiveEntry(key, {
            type: "assistant",
            subtype: "partial",
            sessionId: sid,
            timestamp: prevEntry?.timestamp ?? parsed?.timestamp ?? new Date().toISOString(),
            message: {
              role: "assistant",
              content: [{ type: "text", text: next }],
            },
            is_partial: true,
          } as any)
          scheduleFlush()
          return
        }

        const msg = parsed as ClaudeStreamMessage
        const msgRole = msg.message?.role ?? msg.type
        if (msgRole === "assistant") {
          sawAssistantRef.current = true
        }
        const uuid = parsed?.uuid as string | undefined
        const messageId = parsed?.message?.id as string | undefined
        const key = uuid
          ? `uuid:${uuid}`
          : messageId
            ? `mid:${messageId}`
            : `seq:${seqRef.current++}`

        upsertLiveEntry(key, msg)

        if (msg.type === "result" && msg.subtype === "error") {
          const message =
            (msg as any).error?.message ??
            (msg as any).error ??
            (msg as any).message ??
            "Claude reported an error"
          debugLog("stream result:error", message, msg)
          setError((prev) => prev ?? String(message))
        }

        scheduleFlush()
      } catch {
        scheduleFlush()
        return
      }
    },
    [debugLog, scheduleFlush, selectedSessionId, upsertLiveEntry],
  )

  const attachScopedListeners = useCallback(
    async (sid: string) => {
      debugLog("attachScopedListeners", sid)
      const outputUnlisten = await listen<string>(`claude-output:${sid}`, (evt) => {
        appendOutputLine(evt.payload)
      })

      const errorUnlisten = await listen<string>(`claude-error:${sid}`, (evt) => {
        if (!isMountedRef.current) return
        setError(evt.payload)
      })

      const completeUnlisten = await listen<boolean>(
        `claude-complete:${sid}`,
        (evt) => {
          if (!isMountedRef.current) return
          debugLog("claude-complete scoped", { sid, ok: evt.payload })
          setIsRunning(false)
          cleanupListeners()
          if (evt.payload === false) {
            setError((prev) => prev ?? "Claude run failed")
          } else if (!sawAssistantRef.current) {
            const message = outputLineCountRef.current
              ? "Claude returned no assistant output"
              : "Claude returned no output"
            setError((prev) => prev ?? message)
          }
          bumpSessionsRefreshNonce()
          void (async () => {
            const count = await loadSessionHistory()
            if (count > 1) return
            setTimeout(() => {
              if (!isMountedRef.current) return
              void loadSessionHistory()
            }, 250)
          })()
          runNextQueuedPromptRef.current()
        },
      )

      unlistenScopedRef.current = [outputUnlisten, errorUnlisten, completeUnlisten]

      unlistenGenericRef.current.forEach((u) => u())
      unlistenGenericRef.current = []
    },
    [appendOutputLine, bumpSessionsRefreshNonce, cleanupListeners, debugLog, loadSessionHistory],
  )

  const attachGenericListeners = useCallback(async () => {
    debugLog("attachGenericListeners")
    const outputUnlisten = await listen<string>("claude-output", (evt) => {
      appendOutputLine(evt.payload)

      if (runSessionIdRef.current) return
      try {
        const msg = JSON.parse(evt.payload) as ClaudeStreamMessage
        if (msg.type === "system" && msg.subtype === "init" && msg.session_id) {
          debugLog("system:init", {
            emittedSessionId: msg.session_id,
            previousSelectedSessionId: selectedSessionId,
          })
          runSessionIdRef.current = msg.session_id
          setRunSessionId(msg.session_id)
          setSelectedSessionId(msg.session_id)
          updateLocalPromptSessionId(msg.session_id)
          attachScopedListeners(msg.session_id)
          const projectPath = resolvedProjectPath
          const projectId = selectedProjectId ?? deriveProjectId(projectPath ?? undefined)
          if (projectId && projectPath) {
            AgentSessionPersistenceService.saveSession(
              msg.session_id,
              projectId,
              projectPath,
            )
          }
        }
      } catch {
        return
      }
    })

    const errorUnlisten = await listen<string>("claude-error", (evt) => {
      if (!isMountedRef.current) return
      setError(evt.payload)
      const payload = JSON.stringify({
        type: "system",
        subtype: "stderr",
        timestamp: new Date().toISOString(),
        message: { role: "system", content: [{ type: "text", text: evt.payload }] },
      })
      appendOutputLine(payload)
    })

    const completeUnlisten = await listen<boolean>("claude-complete", (evt) => {
      if (!isMountedRef.current) return
      debugLog("claude-complete generic", { ok: evt.payload })
      setIsRunning(false)
      cleanupListeners()
      if (evt.payload === false) {
        setError((prev) => prev ?? "Claude run failed")
      } else if (!sawAssistantRef.current) {
        const message = outputLineCountRef.current
          ? "Claude returned no assistant output"
          : "Claude returned no output"
        setError((prev) => prev ?? message)
      }
      bumpSessionsRefreshNonce()
      void (async () => {
        const count = await loadSessionHistory()
        if (count > 1) return
        setTimeout(() => {
          if (!isMountedRef.current) return
          void loadSessionHistory()
        }, 250)
      })()
      runNextQueuedPromptRef.current()
    })

    unlistenGenericRef.current = [
      outputUnlisten,
      errorUnlisten,
      completeUnlisten,
    ]
  }, [
    appendOutputLine,
    attachScopedListeners,
    bumpSessionsRefreshNonce,
    cleanupListeners,
    deriveProjectId,
    debugLog,
    updateLocalPromptSessionId,
    loadSessionHistory,
    selectedProjectId,
    selectedSessionId,
    resolvedProjectPath,
  ])

  useEffect(() => {
    AgentSessionPersistenceService.cleanupOldSessions()
    let active = true
    const reconnect = async () => {
      try {
        const running = await claudeCodeService.listRunningSessions()
        if (!active || !running?.length) return
        const sorted = [...running].sort((a, b) => {
          const aTime = new Date(a.started_at ?? a.startedAt ?? 0).getTime()
          const bTime = new Date(b.started_at ?? b.startedAt ?? 0).getTime()
          return bTime - aTime
        })
        const info = sorted[0]
        const sessionId = extractSessionId(info)
        if (!sessionId) return
        const projectPath = info.project_path ?? info.projectPath ?? ""
        const projectId = selectedProjectId || deriveProjectId(projectPath)

        setSelectedProject(projectId || null, projectPath || null)
        setSelectedSessionId(sessionId)
        setRunSessionId(sessionId)
        runSessionIdRef.current = sessionId
        setIsRunning(true)
        resetLiveState()
        cleanupListeners()
        await attachScopedListeners(sessionId)

        const output = await claudeCodeService.getSessionOutput(sessionId)
        if (output) {
          output
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .forEach((line) => appendOutputLine(line))
        }

        const historyCount = await loadSessionHistoryFor(projectId, sessionId)
        AgentSessionPersistenceService.saveSession(
          sessionId,
          projectId,
          projectPath,
          historyCount,
        )
      } catch (e) {
        if (!active) return
        debugLog("reconnect failed", e)
      }
    }
    void reconnect()
    return () => {
      active = false
    }
  }, [
    appendOutputLine,
    attachScopedListeners,
    cleanupListeners,
    debugLog,
    deriveProjectId,
    extractSessionId,
    loadSessionHistoryFor,
    resetLiveState,
    selectedProjectId,
    setSelectedProject,
    setSelectedSessionId,
  ])

  const startRun = useCallback(async () => {
    if (projectPathStatus.valid === false) {
      setError(projectPathStatus.message || "Project path not found")
      return
    }
    debugLog("startRun(New Session)", {
      selectedProjectPath: resolvedProjectPath,
      selectedSessionId,
      model,
      prompt: promptDraft,
    })
    if (!resolvedProjectPath) {
      setError("Select a project first")
      return
    }
    if (!promptDraft.trim()) {
      setError("Enter a prompt")
      return
    }

    setError(null)
    clearPromptDraft()
    resetRunSignals()
    setHistory([])
    resetLiveState()
    upsertLiveEntry(`local:${Date.now()}:${seqRef.current++}`, {
      type: "user",
      timestamp: new Date().toISOString(),
      message: { role: "user", content: promptDraft },
      local_prompt: true,
    } as any)
    scheduleFlush()
    setRunSessionId(null)
    runSessionIdRef.current = null
    setSelectedSessionId(null)

    cleanupListeners()
    await attachGenericListeners()

    setIsRunning(true)
    try {
      await claudeCodeService.execute({
        projectPath: resolvedProjectPath,
        prompt: promptDraft,
        model,
      })
    } catch (e) {
      setIsRunning(false)
      cleanupListeners()
      const message =
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : (e as any)?.message
              ? String((e as any).message)
              : JSON.stringify(e)
      setError(message || "Failed to start Claude run")
    }
  }, [
    attachGenericListeners,
    cleanupListeners,
    clearPromptDraft,
    debugLog,
    model,
    projectPathStatus,
    promptDraft,
    resetRunSignals,
    resetLiveState,
    scheduleFlush,
    resolvedProjectPath,
    selectedSessionId,
    upsertLiveEntry,
  ])

  const sendPrompt = useCallback(
    async (override?: { prompt: string; model: string }) => {
      if (projectPathStatus.valid === false) {
        setError(projectPathStatus.message || "Project path not found")
        return
      }
      const nextPrompt = override?.prompt ?? promptDraft
      const nextModel = override?.model ?? model

      if (isRunning) {
        if (nextPrompt.trim()) {
          enqueuePrompt(nextPrompt, nextModel)
          if (!override) {
            clearPromptDraft()
          }
        }
        return
      }

      debugLog("sendPrompt", {
        selectedProjectPath: resolvedProjectPath,
        selectedSessionId,
        model: nextModel,
        prompt: nextPrompt,
      })
      if (!resolvedProjectPath) {
        setError("Select a project first")
        return
      }
    if (!nextPrompt.trim()) {
      setError("Enter a prompt")
      return
    }

    setError(null)
    if (!override) {
      clearPromptDraft()
    }
    resetRunSignals()
    resetLiveState()
      upsertLiveEntry(`local:${Date.now()}:${seqRef.current++}`, {
        type: "user",
        sessionId: selectedSessionId ?? undefined,
        timestamp: new Date().toISOString(),
        message: { role: "user", content: nextPrompt },
        local_prompt: true,
      } as any)
      scheduleFlush()
      setRunSessionId(null)
      runSessionIdRef.current = null

      cleanupListeners()
      await attachGenericListeners()

      setIsRunning(true)
      try {
        if (selectedSessionId) {
          debugLog("sendPrompt -> resume_claude_code", { selectedSessionId })
          await claudeCodeService.resume({
            projectPath: resolvedProjectPath,
            sessionId: selectedSessionId,
            prompt: nextPrompt,
            model: nextModel,
          })
        } else {
          debugLog("sendPrompt -> execute_claude_code (no selectedSessionId)")
          await claudeCodeService.execute({
            projectPath: resolvedProjectPath,
            prompt: nextPrompt,
            model: nextModel,
          })
        }
      } catch (e) {
        setIsRunning(false)
        cleanupListeners()
        const message =
          e instanceof Error
            ? e.message
            : typeof e === "string"
              ? e
              : (e as any)?.message
                ? String((e as any).message)
                : JSON.stringify(e)
        setError(message || "Failed to send prompt")
      }
    },
    [
      attachGenericListeners,
      cleanupListeners,
      clearPromptDraft,
      debugLog,
      enqueuePrompt,
      isRunning,
      model,
      projectPathStatus,
      promptDraft,
      resetRunSignals,
      resetLiveState,
      scheduleFlush,
      resolvedProjectPath,
      selectedSessionId,
      upsertLiveEntry,
    ],
  )

  const runNextQueuedPrompt = useCallback(() => {
    if (isRunning || !queuedPrompts.length) return
    const next = queuedPrompts[0]
    setQueuedPrompts((prev) => prev.slice(1))
    void sendPrompt({ prompt: next.prompt, model: next.model })
  }, [isRunning, queuedPrompts, sendPrompt])

  useEffect(() => {
    runNextQueuedPromptRef.current = runNextQueuedPrompt
  }, [runNextQueuedPrompt])

  useEffect(() => {
    if (!isRunning && queuedPrompts.length) {
      runNextQueuedPrompt()
    }
  }, [isRunning, queuedPrompts.length, runNextQueuedPrompt])

  const continueRun = useCallback(async () => {
    if (projectPathStatus.valid === false) {
      setError(projectPathStatus.message || "Project path not found")
      return
    }
    debugLog("continueRun(most recent)", {
      selectedProjectPath: resolvedProjectPath,
      selectedSessionId,
      model,
      prompt: promptDraft,
    })
    if (!resolvedProjectPath) {
      setError("Select a project first")
      return
    }
    if (!promptDraft.trim()) {
      setError("Enter a prompt")
      return
    }

    setError(null)
    clearPromptDraft()
    resetRunSignals()
    resetLiveState()
    upsertLiveEntry(`local:${Date.now()}:${seqRef.current++}`, {
      type: "user",
      timestamp: new Date().toISOString(),
      message: { role: "user", content: promptDraft },
      local_prompt: true,
    } as any)
    scheduleFlush()
    setRunSessionId(null)
    runSessionIdRef.current = null

    cleanupListeners()
    await attachGenericListeners()

    setIsRunning(true)
    try {
      await claudeCodeService.continue({
        projectPath: resolvedProjectPath,
        prompt: promptDraft,
        model,
      })
    } catch (e) {
      setIsRunning(false)
      cleanupListeners()
      const message =
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : (e as any)?.message
              ? String((e as any).message)
              : JSON.stringify(e)
      setError(message || "Failed to start Claude run")
    }
  }, [
    attachGenericListeners,
    cleanupListeners,
    clearPromptDraft,
    debugLog,
    model,
    projectPathStatus,
    promptDraft,
    resetRunSignals,
    resetLiveState,
    scheduleFlush,
    resolvedProjectPath,
    selectedSessionId,
    upsertLiveEntry,
  ])

  const resumeRun = useCallback(async () => {
    if (projectPathStatus.valid === false) {
      setError(projectPathStatus.message || "Project path not found")
      return
    }
    debugLog("resumeRun(explicit)", {
      selectedProjectPath: resolvedProjectPath,
      selectedSessionId,
      model,
      prompt: promptDraft,
    })
    if (!resolvedProjectPath) {
      setError("Select a project first")
      return
    }
    if (!selectedSessionId) {
      setError("Select a session to resume")
      return
    }
    if (!promptDraft.trim()) {
      setError("Enter a prompt")
      return
    }

    setError(null)
    clearPromptDraft()
    resetRunSignals()
    resetLiveState()
    upsertLiveEntry(`local:${Date.now()}:${seqRef.current++}`, {
      type: "user",
      sessionId: selectedSessionId ?? undefined,
      timestamp: new Date().toISOString(),
      message: { role: "user", content: promptDraft },
      local_prompt: true,
    } as any)
    scheduleFlush()
    setRunSessionId(null)
    runSessionIdRef.current = null

    cleanupListeners()
    await attachGenericListeners()

    setIsRunning(true)
    try {
      await claudeCodeService.resume({
        projectPath: resolvedProjectPath,
        sessionId: selectedSessionId,
        prompt: promptDraft,
        model,
      })
    } catch (e) {
      setIsRunning(false)
      cleanupListeners()
      const message =
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : (e as any)?.message
              ? String((e as any).message)
              : JSON.stringify(e)
      setError(message || "Failed to resume Claude run")
    }
  }, [
    attachGenericListeners,
    cleanupListeners,
    clearPromptDraft,
    debugLog,
    model,
    projectPathStatus,
    promptDraft,
    resetRunSignals,
    resetLiveState,
    scheduleFlush,
    resolvedProjectPath,
    selectedSessionId,
    upsertLiveEntry,
  ])

  const cancelRun = useCallback(async () => {
    debugLog("cancelRun")
    try {
      await claudeCodeService.cancel(runSessionId ?? selectedSessionId ?? undefined)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel")
    } finally {
      setIsRunning(false)
      cleanupListeners()
    }
  }, [cleanupListeners, debugLog, runSessionId, selectedSessionId])

  const outputText = useMemo(() => liveLines.join("\n"), [liveLines])
  const mergedEntries = useMemo(
    () => {
      const activeSessionId = runSessionId ?? selectedSessionId
      const combined = [...history, ...liveEntries].map((entry, index) => ({
        entry,
        index,
      }))

      const filtered = combined.filter(({ entry, index }) => {
        if (!activeSessionId) return true
        if (index < history.length) return true
        const sid = entry.session_id ?? entry.sessionId
        if (!sid) return true
        return sid === activeSessionId
      })

      const latestIndex = new Map<string, number>()
      const keys: string[] = new Array(filtered.length)
      filtered.forEach(({ entry, index }, i) => {
        const sid = entry.session_id ?? entry.sessionId ?? ""
        const uuid = (entry as any)?.uuid as string | undefined
        const messageId = entry.message?.id
        const key = uuid
          ? `${sid}|uuid|${uuid}`
          : messageId
            ? `${sid}|mid|${messageId}`
            : `${sid}|${entry.type ?? ""}|${entry.subtype ?? ""}|${entry.timestamp ?? ""}|${index}`
        keys[i] = key
        latestIndex.set(key, i)
      })

      const sortedEntries = filtered
        .filter((_, i) => latestIndex.get(keys[i]) === i)
        .map((x) => x.entry)
      const extractUserText = (entry: ClaudeStreamMessage): string | null => {
        if (entry.message?.role !== "user") return null
        const c = entry.message?.content
        if (typeof c === "string") return c.trim() || null
        if (Array.isArray(c)) {
          const texts = c
            .filter((p: any) => p?.type === "text" && typeof p?.text === "string")
            .map((p: any) => (p.text as string).trim())
            .filter(Boolean)
          const joined = texts.join("\n").trim()
          return joined || null
        }
        return null
      }

      const normalizeText = (value: string) => value.replace(/\s+/g, " ").trim()
      const nonLocalUserTimes = new Map<string, number[]>()
      sortedEntries.forEach((e: any) => {
        if (e?.local_prompt) return
        const text = extractUserText(e)
        if (!text) return
        const ts = Date.parse(e.timestamp ?? "")
        if (!Number.isFinite(ts)) return
        const key = normalizeText(text)
        const list = nonLocalUserTimes.get(key) ?? []
        list.push(ts)
        nonLocalUserTimes.set(key, list)
      })

      const isLocalDup = (e: any): boolean => {
        if (!e?.local_prompt) return false
        const text = extractUserText(e)
        if (!text) return false
        const localTs = Date.parse(e.timestamp ?? "")
        if (!Number.isFinite(localTs)) return false
        const list = nonLocalUserTimes.get(normalizeText(text))
        if (!list || !list.length) return false
        return list.some((t) => Math.abs(t - localTs) <= 10_000)
      }

      return sortedEntries.filter((e: any) => !isLocalDup(e))
    },
    [history, liveEntries, runSessionId, selectedSessionId],
  )

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
        <Flex justify="space-between" align="center" style={{ gap: token.marginSM }}>
          <Flex vertical style={{ minWidth: 0 }}>
            <Text strong>Agent</Text>
            <Text type="secondary" ellipsis>
              {resolvedProjectPath ?? "Select a project to begin"}
            </Text>
            <Flex style={{ gap: token.marginXS, flexWrap: "wrap" }}>
              {runSessionId ? <Tag color="processing">Running</Tag> : null}
              {selectedSessionId ? <Tag>{selectedSessionId}</Tag> : null}
            </Flex>
          </Flex>
          <Flex style={{ gap: token.marginSM }}>
            <Tabs
              size="small"
              activeKey={view}
              onChange={(value) => setView(value as any)}
              items={[
                { key: "chat", label: "Chat" },
                { key: "debug", label: "Debug" },
              ]}
            />
            <Badge count={queuedPrompts.length} size="small">
              <Button icon={<ToolOutlined />} onClick={() => setToolsOpen(true)}>
                Tools
              </Button>
            </Badge>
            <Button onClick={loadSessionHistory} disabled={!selectedSessionId}>
              Reload History
            </Button>
            <Button danger onClick={cancelRun} disabled={!isRunning}>
              Cancel
            </Button>
          </Flex>
        </Flex>

        {projectPathStatus.valid === false ? (
          <Alert
            type="warning"
            message={projectPathStatus.message || "Project path not found"}
            showIcon
          />
        ) : null}

        {error ? (
          <Alert type="error" message={error} showIcon />
        ) : null}

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
            />
          )}
        </div>

        <div
          className="agent-view-input-wrapper"
          style={{
            position: "sticky",
            bottom: 0,
            zIndex: 10,
            background:
              token.colorBgContainer ??
              (token.colorBgLayout || "transparent"),
            backdropFilter: "blur(10px)",
            borderTop: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <Card
            size="small"
            className="agent-view-input-card"
            styles={{ body: { padding: token.paddingSM } }}
            style={{ borderRadius: token.borderRadius }}
          >
            <Flex vertical style={{ gap: token.marginSM }}>
              <Flex align="center" style={{ gap: token.marginSM, flexWrap: "wrap" }}>
                <AutoComplete
                  value={model}
                  onChange={(value) => setModel(value)}
                  options={[
                    { value: "sonnet" },
                    { value: "haiku" },
                    { value: "opus" },
                  ]}
                  style={{ minWidth: 220 }}
                  placeholder="Model (e.g. sonnet / opus)"
                />
              </Flex>

              {queuedPrompts.length ? (
                <Card size="small" styles={{ body: { padding: token.paddingXS } }}>
                  <Flex vertical style={{ gap: token.marginXS }}>
                    <Text type="secondary">Queued prompts</Text>
                    <List
                      size="small"
                      dataSource={queuedPrompts}
                      renderItem={(item) => (
                        <List.Item
                          actions={[
                            <Button
                              key="remove"
                              size="small"
                              onClick={() =>
                                setQueuedPrompts((prev) =>
                                  prev.filter((p) => p.id !== item.id),
                                )
                              }
                            >
                              Remove
                            </Button>,
                          ]}
                        >
                          <Flex vertical style={{ minWidth: 0 }}>
                            <Text ellipsis>{item.prompt}</Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {item.model}
                            </Text>
                          </Flex>
                        </List.Item>
                      )}
                    />
                  </Flex>
                </Card>
              ) : null}

              <Input.TextArea
                value={promptDraft}
                onChange={(e) => setPromptDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || e.shiftKey) return
                  const nativeEvent = e.nativeEvent as any
                  if (nativeEvent?.isComposing) return
                  e.preventDefault()
                  void sendPrompt()
                }}
                placeholder="Enter a prompt for Claude Code"
                autoSize={{ minRows: 2, maxRows: 8 }}
                disabled={isRunning}
              />

              <Flex style={{ gap: token.marginSM, flexWrap: "wrap" }}>
                <Button
                  type="primary"
                  onClick={() => void sendPrompt()}
                  loading={isRunning}
                  disabled={projectPathStatus.valid !== true}
                >
                  Send
                </Button>
                <Button
                  onClick={startRun}
                  disabled={isRunning || projectPathStatus.valid !== true}
                >
                  New Session
                </Button>
                <Button
                  onClick={continueRun}
                  disabled={isRunning || projectPathStatus.valid !== true}
                >
                  Continue
                </Button>
                <Button
                  onClick={resumeRun}
                  disabled={
                    isRunning ||
                    !selectedSessionId ||
                    projectPathStatus.valid !== true
                  }
                >
                  Resume
                </Button>
              </Flex>
            </Flex>
          </Card>
        </div>

        <Drawer
          title="Session Tools"
          placement="right"
          width={520}
          onClose={() => setToolsOpen(false)}
          open={toolsOpen}
        >
          <Tabs
            activeKey={toolsTab}
            onChange={setToolsTab}
            items={[
              {
                key: "timeline",
                label: "Timeline",
                children: (
                  <TimelinePanel
                    sessionId={selectedSessionId}
                    projectId={
                      selectedProjectId ??
                      deriveProjectId(resolvedProjectPath ?? undefined)
                    }
                    projectPath={resolvedProjectPath}
                  />
                ),
              },
              {
                key: "slash",
                label: "Slash Commands",
                children: (
                  <SlashCommandsPanel
                    projectPath={resolvedProjectPath}
                  />
                ),
              },
              {
                key: "preview",
                label: "Preview",
                children: <PreviewPanel />,
              },
              {
                key: "installer",
                label: "Installer",
                children: <ClaudeInstallPanel projectPath={resolvedProjectPath} />,
              },
            ]}
          />
        </Drawer>
      </Flex>
    </Content>
  )
}
