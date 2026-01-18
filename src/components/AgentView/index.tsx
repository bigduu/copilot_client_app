import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { listen } from "@tauri-apps/api/event"
import {
  Alert,
  Button,
  Card,
  AutoComplete,
  Flex,
  Input,
  Layout,
  Segmented,
  Switch,
  Typography,
  theme,
} from "antd"

import { serviceFactory } from "../../services/ServiceFactory"
import { useAgentStore } from "../../store/agentStore"
import { ClaudeStreamPanel } from "../ClaudeStream"
import type { ClaudeStreamMessage } from "../ClaudeStream"
import { AgentChatView } from "../AgentChatView"

type ClaudeProject = {
  id: string
  path: string
}

const { Content } = Layout
const { Text } = Typography

export const AgentView: React.FC = () => {
  const debugLog = useCallback((...args: any[]) => {
    if (!import.meta.env.DEV) return
    // eslint-disable-next-line no-console -- dev-only debug trace
    console.log("[AgentView]", ...args)
  }, [])

  const { token } = theme.useToken()
  const selectedProjectId = useAgentStore((s) => s.selectedProjectId)
  const selectedSessionId = useAgentStore((s) => s.selectedSessionId)
  const model = useAgentStore((s) => s.model)
  const skipPermissions = useAgentStore((s) => s.skipPermissions)
  const promptDraft = useAgentStore((s) => s.promptDraft)

  const setPromptDraft = useAgentStore((s) => s.setPromptDraft)
  const setModel = useAgentStore((s) => s.setModel)
  const setSkipPermissions = useAgentStore((s) => s.setSkipPermissions)
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

  const viewRef = useRef(view)
  const unlistenGenericRef = useRef<Array<() => void>>([])
  const unlistenScopedRef = useRef<Array<() => void>>([])
  const runSessionIdRef = useRef<string | null>(null)
  const isMountedRef = useRef(true)

  const pendingLinesRef = useRef<string[]>([])
  const liveLinesBufferRef = useRef<string[]>([])
  const liveMapRef = useRef<Map<string, ClaudeStreamMessage>>(new Map())
  const liveOrderRef = useRef<string[]>([])
  const flushTimerRef = useRef<number | null>(null)
  const seqRef = useRef(0)
  const partialTextRef = useRef<Map<string, string>>(new Map())

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

  const selectedProjectPath = useMemo(() => {
    if (!selectedProjectId) return null
    return projectsIndex.get(selectedProjectId)?.path ?? null
  }, [projectsIndex, selectedProjectId])

  const loadProjectsIndex = useCallback(async () => {
    try {
      const list = await serviceFactory.invoke<ClaudeProject[]>(
        "list_claude_projects",
      )
      const map = new Map<string, ClaudeProject>()
      list.forEach((p) => map.set(p.id, { id: p.id, path: p.path }))
      setProjectsIndex(map)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load projects")
    }
  }, [])

  useEffect(() => {
    loadProjectsIndex()
  }, [loadProjectsIndex])

  const loadSessionHistory = useCallback(async (): Promise<number> => {
    if (!selectedProjectId || !selectedSessionId) {
      setHistory([])
      return 0
    }

    setError(null)
    try {
      const entries = await serviceFactory.invoke<any[]>("get_session_jsonl", {
        projectId: selectedProjectId,
        sessionId: selectedSessionId,
      })
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
      setHistory([])
      return 0
    }
  }, [debugLog, selectedProjectId, selectedSessionId])

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
        }
      } catch {
        return
      }
    })

    const errorUnlisten = await listen<string>("claude-error", (evt) => {
      if (!isMountedRef.current) return
      setError(evt.payload)
    })

    const completeUnlisten = await listen<boolean>("claude-complete", (evt) => {
      if (!isMountedRef.current) return
      debugLog("claude-complete generic", { ok: evt.payload })
      setIsRunning(false)
      cleanupListeners()
      if (evt.payload === false) {
        setError((prev) => prev ?? "Claude run failed")
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
    debugLog,
    updateLocalPromptSessionId,
    loadSessionHistory,
    selectedSessionId,
  ])

	  const startRun = useCallback(async () => {
    debugLog("startRun(New Session)", {
      selectedProjectPath,
      selectedSessionId,
      model,
      skipPermissions,
      prompt: promptDraft,
    })
    if (!selectedProjectPath) {
      setError("Select a project first")
      return
    }
    if (!promptDraft.trim()) {
      setError("Enter a prompt")
      return
    }

	    setError(null)
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
      await serviceFactory.invoke("execute_claude_code", {
        params: {
          projectPath: selectedProjectPath,
          prompt: promptDraft,
          model,
          skipPermissions: skipPermissions,
        },
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
	    debugLog,
	    model,
	    promptDraft,
	    resetLiveState,
	    scheduleFlush,
	    selectedProjectPath,
	    selectedSessionId,
	    skipPermissions,
	    upsertLiveEntry,
	  ])

	  const sendPrompt = useCallback(async () => {
    debugLog("sendPrompt", {
      selectedProjectPath,
      selectedSessionId,
      model,
      skipPermissions,
      prompt: promptDraft,
    })
    if (!selectedProjectPath) {
      setError("Select a project first")
      return
    }
    if (!promptDraft.trim()) {
      setError("Enter a prompt")
      return
    }

	    setError(null)
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
      if (selectedSessionId) {
        debugLog("sendPrompt -> resume_claude_code", { selectedSessionId })
        await serviceFactory.invoke("resume_claude_code", {
          projectPath: selectedProjectPath,
          sessionId: selectedSessionId,
          prompt: promptDraft,
          model,
          skipPermissions: skipPermissions,
        })
      } else {
        debugLog("sendPrompt -> execute_claude_code (no selectedSessionId)")
        await serviceFactory.invoke("execute_claude_code", {
          params: {
            projectPath: selectedProjectPath,
            prompt: promptDraft,
            model,
            skipPermissions: skipPermissions,
          },
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
	  }, [
	    attachGenericListeners,
	    cleanupListeners,
	    debugLog,
	    model,
	    promptDraft,
	    resetLiveState,
	    scheduleFlush,
	    selectedProjectPath,
	    selectedSessionId,
	    skipPermissions,
	    upsertLiveEntry,
	  ])

  const continueRun = useCallback(async () => {
    debugLog("continueRun(most recent)", {
      selectedProjectPath,
      selectedSessionId,
      model,
      skipPermissions,
      prompt: promptDraft,
    })
    if (!selectedProjectPath) {
      setError("Select a project first")
      return
    }
    if (!promptDraft.trim()) {
      setError("Enter a prompt")
      return
    }

	    setError(null)
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
      await serviceFactory.invoke("continue_claude_code", {
        params: {
          projectPath: selectedProjectPath,
          prompt: promptDraft,
          model,
          skipPermissions: skipPermissions,
        },
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
	    debugLog,
	    model,
	    promptDraft,
	    resetLiveState,
	    scheduleFlush,
	    selectedProjectPath,
	    selectedSessionId,
	    skipPermissions,
	    upsertLiveEntry,
	  ])

  const resumeRun = useCallback(async () => {
    debugLog("resumeRun(explicit)", {
      selectedProjectPath,
      selectedSessionId,
      model,
      skipPermissions,
      prompt: promptDraft,
    })
    if (!selectedProjectPath) {
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
      await serviceFactory.invoke("resume_claude_code", {
        projectPath: selectedProjectPath,
        sessionId: selectedSessionId,
        prompt: promptDraft,
        model,
        skipPermissions: skipPermissions,
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
	    debugLog,
	    model,
	    promptDraft,
	    resetLiveState,
	    scheduleFlush,
	    selectedProjectPath,
	    selectedSessionId,
	    skipPermissions,
	    upsertLiveEntry,
	  ])

  const cancelRun = useCallback(async () => {
    debugLog("cancelRun")
    try {
      await serviceFactory.invoke("cancel_claude_execution")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel")
    } finally {
      setIsRunning(false)
      cleanupListeners()
    }
  }, [cleanupListeners, debugLog])

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
        const sid = entry.session_id ?? entry.sessionId
        // Keep pre-init live messages that don't have session_id yet.
        if (!sid) {
          return index >= history.length
        }
        return sid === activeSessionId
      })

      // Prefer "latest wins" for the same uuid/message.id so streaming updates replace earlier
      // partial entries rather than being deduped away.
      const byKey = new Map<string, { entry: ClaudeStreamMessage; index: number }>()
      filtered.forEach(({ entry, index }) => {
        const sid = entry.session_id ?? entry.sessionId ?? ""
        const uuid = (entry as any)?.uuid as string | undefined
        const messageId = entry.message?.id
        const key = uuid
          ? `${sid}|uuid|${uuid}`
          : messageId
            ? `${sid}|mid|${messageId}`
            : `${sid}|${entry.type ?? ""}|${entry.subtype ?? ""}|${entry.timestamp ?? ""}|${index}`

        const existing = byKey.get(key)
        if (!existing || existing.index < index) {
          byKey.set(key, { entry, index })
        }
      })

      const deduped = Array.from(byKey.values())

      deduped.sort((a, b) => {
        const at = Date.parse(a.entry.timestamp ?? "")
        const bt = Date.parse(b.entry.timestamp ?? "")
        const aHas = Number.isFinite(at)
        const bHas = Number.isFinite(bt)
        if (aHas && bHas) return at - bt
        if (aHas) return -1
        if (bHas) return 1
        return a.index - b.index
      })

      const sortedEntries = deduped.map((x) => x.entry)
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
    <Content style={{ height: "100vh", overflow: "hidden" }}>
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
              {selectedProjectPath ?? "Select a project to begin"}
            </Text>
            {runSessionId ? (
              <Text type="secondary" ellipsis>
                Running session: {runSessionId}
              </Text>
            ) : null}
          </Flex>
          <Flex style={{ gap: token.marginSM }}>
            <Segmented
              size="small"
              value={view}
              options={[
                { label: "Chat", value: "chat" },
                { label: "Debug", value: "debug" },
              ]}
              onChange={(value) => setView(value as any)}
            />
            <Button onClick={loadSessionHistory} disabled={!selectedSessionId}>
              Reload History
            </Button>
            <Button danger onClick={cancelRun} disabled={!isRunning}>
              Cancel
            </Button>
          </Flex>
        </Flex>

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
            <AgentChatView entries={mergedEntries} autoScrollToken={liveTick} />
          )}
        </div>

        <Card
          size="small"
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

              <Flex align="center" style={{ gap: 8 }}>
                <Switch
                  checked={skipPermissions}
                  onChange={(v) => setSkipPermissions(v)}
                />
                <Text>Skip Permissions</Text>
              </Flex>
            </Flex>

            {skipPermissions ? (
              <Alert
                type="warning"
                showIcon
                message="Skip Permissions is enabled for the next run"
              />
            ) : null}

            <Input.TextArea
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
              placeholder="Enter a prompt for Claude Code"
              autoSize={{ minRows: 2, maxRows: 8 }}
              disabled={isRunning}
            />

            <Flex style={{ gap: token.marginSM, flexWrap: "wrap" }}>
              <Button type="primary" onClick={sendPrompt} loading={isRunning}>
                Send
              </Button>
              <Button onClick={startRun} disabled={isRunning}>
                New Session
              </Button>
              <Button onClick={continueRun} disabled={isRunning}>
                Continue
              </Button>
              <Button onClick={resumeRun} disabled={isRunning || !selectedSessionId}>
                Resume
              </Button>
            </Flex>
          </Flex>
        </Card>
      </Flex>
    </Content>
  )
}
