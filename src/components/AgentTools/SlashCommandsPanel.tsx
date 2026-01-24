import React, { useCallback, useEffect, useState } from "react"
import { Alert, Button, Card, Flex, Input, List, Select, Typography } from "antd"

import { claudeCodeService } from "../../services/ClaudeCodeService"

const { Text } = Typography

type Scope = "project" | "user"

export const SlashCommandsPanel: React.FC<{
  projectPath?: string | null
}> = ({ projectPath }) => {
  const [commands, setCommands] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scope, setScope] = useState<Scope>("project")
  const [name, setName] = useState("")
  const [namespace, setNamespace] = useState("")
  const [description, setDescription] = useState("")
  const [allowedTools, setAllowedTools] = useState("")
  const [content, setContent] = useState("")

  const loadCommands = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await claudeCodeService.slashCommandsList(
        scope === "project" ? projectPath ?? undefined : undefined,
      )
      setCommands(data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load slash commands")
    } finally {
      setIsLoading(false)
    }
  }, [projectPath, scope])

  useEffect(() => {
    void loadCommands()
  }, [loadCommands])

  const saveCommand = useCallback(async () => {
    if (!name.trim()) {
      setError("Command name is required")
      return
    }
    if (scope === "project" && !projectPath) {
      setError("Select a project to save project-scoped commands")
      return
    }
    setError(null)
    try {
      await claudeCodeService.slashCommandSave({
        scope,
        name: name.trim(),
        namespace: namespace.trim() || null,
        content: content.trim(),
        description: description.trim() || null,
        allowedTools: allowedTools
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        projectPath: scope === "project" ? projectPath ?? undefined : undefined,
      })
      setName("")
      setNamespace("")
      setDescription("")
      setAllowedTools("")
      setContent("")
      await loadCommands()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save command")
    }
  }, [allowedTools, content, description, loadCommands, name, namespace, projectPath, scope])

  const deleteCommand = useCallback(
    async (commandId: string) => {
      setError(null)
      try {
        await claudeCodeService.slashCommandDelete(
          commandId,
          scope === "project" ? projectPath ?? undefined : undefined,
        )
        await loadCommands()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete command")
      }
    },
    [loadCommands, projectPath, scope],
  )

  return (
    <Flex vertical style={{ gap: 12 }}>
      {error ? <Alert type="error" message={error} /> : null}

      <Card size="small">
        <Flex vertical style={{ gap: 8 }}>
          <Text strong>New slash command</Text>
          <Select<Scope>
            value={scope}
            onChange={setScope}
            options={[
              { value: "project", label: "Project" },
              { value: "user", label: "User" },
            ]}
          />
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          <Input
            value={namespace}
            onChange={(e) => setNamespace(e.target.value)}
            placeholder="Namespace (optional)"
          />
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
          />
          <Input
            value={allowedTools}
            onChange={(e) => setAllowedTools(e.target.value)}
            placeholder="Allowed tools (comma-separated)"
          />
          <Input.TextArea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Command content"
            autoSize={{ minRows: 4, maxRows: 12 }}
          />
          <Button onClick={saveCommand}>Save</Button>
        </Flex>
      </Card>

      <List
        loading={isLoading}
        dataSource={commands}
        renderItem={(item) => (
          <List.Item
            actions={[
              <Button
                key="delete"
                size="small"
                onClick={() => deleteCommand(item.id)}
              >
                Delete
              </Button>,
            ]}
          >
            <Flex vertical style={{ minWidth: 0 }}>
              <Text strong>{item.full_command ?? item.name ?? item.id}</Text>
              {item.description ? <Text type="secondary">{item.description}</Text> : null}
            </Flex>
          </List.Item>
        )}
      />
    </Flex>
  )
}
