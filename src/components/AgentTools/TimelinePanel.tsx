import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Alert, Button, Card, Flex, Input, List, Typography } from "antd"

import { claudeCodeService } from "../../services/ClaudeCodeService"

const { Text } = Typography

export const TimelinePanel: React.FC<{
  sessionId?: string | null
  projectId?: string | null
  projectPath?: string | null
}> = ({ sessionId, projectId, projectPath }) => {
  const [checkpoints, setCheckpoints] = useState<any[]>([])
  const [timeline, setTimeline] = useState<any | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newDescription, setNewDescription] = useState("")
  const [forkName, setForkName] = useState("")

  const canLoad = Boolean(sessionId && projectId && projectPath)

  const loadData = useCallback(async () => {
    if (!canLoad) return
    setIsLoading(true)
    setError(null)
    try {
      const [checkpointList, timelineData] = await Promise.all([
        claudeCodeService.listCheckpoints(sessionId!, projectId!, projectPath!),
        claudeCodeService.getSessionTimeline(sessionId!, projectId!, projectPath!),
      ])
      setCheckpoints(checkpointList ?? [])
      setTimeline(timelineData ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load checkpoints")
    } finally {
      setIsLoading(false)
    }
  }, [canLoad, projectId, projectPath, sessionId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const createCheckpoint = useCallback(async () => {
    if (!canLoad) return
    setError(null)
    try {
      await claudeCodeService.createCheckpoint(
        sessionId!,
        projectId!,
        projectPath!,
        newDescription || undefined,
      )
      setNewDescription("")
      await loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create checkpoint")
    }
  }, [canLoad, loadData, newDescription, projectId, projectPath, sessionId])

  const restoreCheckpoint = useCallback(
    async (checkpointId: string) => {
      if (!canLoad) return
      setError(null)
      try {
        await claudeCodeService.restoreCheckpoint(
          checkpointId,
          sessionId!,
          projectId!,
          projectPath!,
        )
        await loadData()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to restore checkpoint")
      }
    },
    [canLoad, loadData, projectId, projectPath, sessionId],
  )

  const forkCheckpoint = useCallback(
    async (checkpointId: string) => {
      if (!canLoad) return
      if (!forkName.trim()) {
        setError("Enter a new session name")
        return
      }
      setError(null)
      try {
        await claudeCodeService.forkFromCheckpoint(
          checkpointId,
          sessionId!,
          projectId!,
          projectPath!,
          forkName.trim(),
        )
        setForkName("")
        await loadData()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to fork checkpoint")
      }
    },
    [canLoad, forkName, loadData, projectId, projectPath, sessionId],
  )

  const summary = useMemo(() => {
    if (!timeline) return null
    return {
      total: timeline.totalCheckpoints ?? timeline.total_checkpoints ?? 0,
      strategy: timeline.checkpointStrategy ?? timeline.checkpoint_strategy,
      current: timeline.currentCheckpointId ?? timeline.current_checkpoint_id,
    }
  }, [timeline])

  if (!canLoad) {
    return <Alert type="info" message="Select a session to view timeline" />
  }

  return (
    <Flex vertical style={{ gap: 12 }}>
      {error ? <Alert type="error" message={error} /> : null}

      {summary ? (
        <Card size="small">
          <Flex vertical style={{ gap: 4 }}>
            <Text>Total checkpoints: {summary.total}</Text>
            {summary.current ? (
              <Text type="secondary">Current: {summary.current}</Text>
            ) : null}
            {summary.strategy ? (
              <Text type="secondary">Strategy: {summary.strategy}</Text>
            ) : null}
          </Flex>
        </Card>
      ) : null}

      <Card size="small">
        <Flex vertical style={{ gap: 8 }}>
          <Text strong>Create checkpoint</Text>
          <Input
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Description (optional)"
          />
          <Button onClick={createCheckpoint} loading={isLoading}>
            Create
          </Button>
        </Flex>
      </Card>

      <Card size="small">
        <Flex vertical style={{ gap: 8 }}>
          <Text strong>Fork from checkpoint</Text>
          <Input
            value={forkName}
            onChange={(e) => setForkName(e.target.value)}
            placeholder="New session name"
          />
        </Flex>
      </Card>

      <List
        loading={isLoading}
        dataSource={checkpoints}
        renderItem={(item) => {
          const ts = item?.timestamp ? new Date(item.timestamp).toLocaleString() : ""
          return (
            <List.Item
              actions={[
                <Button
                  key="restore"
                  size="small"
                  onClick={() => restoreCheckpoint(item.id)}
                >
                  Restore
                </Button>,
                <Button
                  key="fork"
                  size="small"
                  onClick={() => forkCheckpoint(item.id)}
                >
                  Fork
                </Button>,
              ]}
            >
              <Flex vertical style={{ minWidth: 0 }}>
                <Text strong>{item.description || item.id}</Text>
                {ts ? <Text type="secondary">{ts}</Text> : null}
                {item?.metadata?.modelUsed ? (
                  <Text type="secondary">Model: {item.metadata.modelUsed}</Text>
                ) : null}
              </Flex>
            </List.Item>
          )
        }}
      />
    </Flex>
  )
}
