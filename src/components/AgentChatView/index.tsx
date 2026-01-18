import React, { useEffect, useMemo, useRef } from "react"
import { Card, Collapse, Flex, Tag, Typography, theme } from "antd"
import ReactMarkdown from "react-markdown"
import rehypeSanitize from "rehype-sanitize"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"

import { createMarkdownComponents } from "../MessageCard/markdownComponents"
import type { ClaudeContentPart, ClaudeStreamMessage } from "../ClaudeStream"

const { Text } = Typography

const normalizeContentParts = (value: any): ClaudeContentPart[] => {
  if (!value) return []

  if (Array.isArray(value)) {
    return value.filter(Boolean) as ClaudeContentPart[]
  }

  if (typeof value === "string") {
    return [{ type: "text", text: value }]
  }

  if (typeof value === "object") {
    const obj: any = value
    if (typeof obj.type !== "string" && typeof obj.text === "string") {
      return [{ ...obj, type: "text" } as ClaudeContentPart]
    }
    return [obj as ClaudeContentPart]
  }

  return []
}

const ClaudeMarkdown: React.FC<{ value: string }> = ({ value }) => {
  const { token } = theme.useToken()
  const components = useMemo(
    () => createMarkdownComponents(token, undefined),
    [token],
  )
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      rehypePlugins={[rehypeSanitize]}
      components={components}
    >
      {value}
    </ReactMarkdown>
  )
}

const formatJson = (value: any): string => {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const isTextPart = (part: ClaudeContentPart): part is { type: "text"; text?: string } =>
  (part as any)?.type === "text"

const getTextValue = (part: any): string => {
  const raw = part?.text
  if (typeof raw === "string") return raw
  if (raw && typeof raw === "object" && typeof raw.text === "string") return raw.text
  if (raw === undefined || raw === null) return ""
  try {
    return JSON.stringify(raw)
  } catch {
    return String(raw)
  }
}

const isToolUsePart = (
  part: ClaudeContentPart,
): part is Extract<ClaudeContentPart, { type: "tool_use" }> =>
  (part as any)?.type === "tool_use"

const isToolResultPart = (
  part: ClaudeContentPart,
): part is Extract<ClaudeContentPart, { type: "tool_result" }> =>
  (part as any)?.type === "tool_result"

const ToolUseBlock: React.FC<{ part: Extract<ClaudeContentPart, { type: "tool_use" }> }> = ({
  part,
}) => {
  const summary = useMemo(() => {
    if (!part.input || typeof part.input !== "object") return null
    const keys = Object.keys(part.input)
    if (!keys.length) return null
    return keys.slice(0, 5).join(", ")
  }, [part.input])

  return (
    <Card size="small" styles={{ body: { padding: 10 } }}>
      <Flex gap={8} align="center" wrap>
        <Tag color="blue">tool_use</Tag>
        <Text strong>{part.name || "Tool"}</Text>
        {part.id ? <Text type="secondary">#{part.id}</Text> : null}
        {summary ? <Text type="secondary">({summary})</Text> : null}
      </Flex>
      {part.input !== undefined ? (
        <Collapse
          size="small"
          items={[
            {
              key: "input",
              label: "Input",
              children: (
                <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
                  {formatJson(part.input)}
                </pre>
              ),
            },
          ]}
        />
      ) : null}
    </Card>
  )
}

const ToolResultBlock: React.FC<{ part: any }> = ({ part }) => {
  const isError = Boolean(part?.is_error)
  return (
    <Card size="small" styles={{ body: { padding: 10 } }}>
      <Flex gap={8} align="center" wrap>
        <Tag color={isError ? "red" : "green"}>tool_result</Tag>
      </Flex>
      {part?.content !== undefined ? (
        <Collapse
          size="small"
          items={[
            {
              key: "output",
              label: "Output",
              children: (
                <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
                  {typeof part.content === "string"
                    ? part.content
                    : formatJson(part.content)}
                </pre>
              ),
            },
          ]}
        />
      ) : null}
    </Card>
  )
}

const isToolResultOnlyUserEntry = (entry: ClaudeStreamMessage): boolean => {
  const parts = normalizeContentParts(entry.message?.content)
  if (!parts.length) return false
  if (entry.message?.role !== "user") return false
  return parts.every((p) => (p as any)?.type === "tool_result")
}

const extractTextFromParts = (parts: ClaudeContentPart[]): string[] => {
  return parts
    .filter((p) => isTextPart(p))
    .map((p: any) => getTextValue(p))
    .filter((t) => t.trim().length > 0)
}

const buildToolResultsMap = (entries: ClaudeStreamMessage[]): Map<string, any> => {
  const map = new Map<string, any>()
  entries.forEach((entry) => {
    const parts = normalizeContentParts(entry.message?.content)
    parts.forEach((part: any) => {
      if (part?.type === "tool_result" && typeof part.tool_use_id === "string") {
        map.set(part.tool_use_id, part)
      }
    })
  })
  return map
}

const getStableEntryKey = (entry: ClaudeStreamMessage, fallbackIdx: number): string => {
  const sid = entry.session_id ?? entry.sessionId ?? ""
  const uuid = (entry as any)?.uuid as string | undefined
  if (uuid) return `${sid}|uuid|${uuid}`
  const messageId = entry.message?.id
  if (messageId) return `${sid}|mid|${messageId}`
  const ts = entry.timestamp ?? ""
  const type = entry.type ?? ""
  const subtype = entry.subtype ?? ""
  if (ts || type || subtype || sid) return `${sid}|${type}|${subtype}|${ts}`
  return `fallback-${fallbackIdx}`
}

const renderAssistantParts = (
  parts: ClaudeContentPart[],
  toolResults: Map<string, any>,
  keyPrefix: string,
) => {
  return (
    <Flex vertical gap={8}>
      {parts.map((part, idx) => {
        const key = `${keyPrefix}-${idx}`
        if (isTextPart(part)) {
          const value = getTextValue(part)
          if (!value.trim()) return null
          return <ClaudeMarkdown key={key} value={value} />
        }
        if (isToolUsePart(part)) {
          const result = part.id ? toolResults.get(part.id) : null
          return (
            <Flex key={key} vertical gap={8}>
              <ToolUseBlock part={part} />
              {result ? <ToolResultBlock part={result} /> : null}
            </Flex>
          )
        }
        if (isToolResultPart(part)) {
          return null
        }
        if ((part as any)?.type === "thinking") {
          const thinking = (part as any)?.thinking
          if (typeof thinking !== "string" || !thinking.trim()) return null
          return (
            <Collapse
              key={key}
              size="small"
              items={[
                {
                  key: "thinking",
                  label: "Thinking",
                  children: (
                    <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
                      {thinking}
                    </pre>
                  ),
                },
              ]}
            />
          )
        }
        return (
          <pre key={key} style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
            {formatJson(part)}
          </pre>
        )
      })}
    </Flex>
  )
}

const inferRole = (entry: ClaudeStreamMessage): "user" | "assistant" | "system" => {
  const role =
    entry.message?.role ??
    (entry.type === "user" || entry.type === "assistant" ? entry.type : null)
  if (role === "user" || role === "assistant") return role
  return "system"
}

export const AgentChatView: React.FC<{
  entries: ClaudeStreamMessage[]
  autoScrollToken?: any
}> = ({ entries, autoScrollToken }) => {
  const { token } = theme.useToken()
  const scrollRef = useRef<HTMLDivElement>(null)

  const toolResults = useMemo(() => buildToolResultsMap(entries), [entries])

  useEffect(() => {
    if (autoScrollToken === undefined) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [autoScrollToken])

  return (
    <div
      ref={scrollRef}
      style={{
        height: "100%",
        overflow: "auto",
        padding: token.paddingSM,
      }}
    >
      <Flex vertical gap={token.marginSM}>
        {entries.map((entry, idx) => {
          if (isToolResultOnlyUserEntry(entry)) {
            return null
          }

          const role = inferRole(entry)
          const align = role === "user" ? "flex-end" : "flex-start"
          const bubbleBg =
            role === "user" ? "var(--ant-color-primary-bg)" : "var(--ant-color-bg-container)"
          const headerTags: React.ReactNode[] = []
          headerTags.push(
            <Tag key="type" color={role === "user" ? "blue" : role === "assistant" ? "purple" : "default"}>
              {role}
            </Tag>,
          )
          if (entry.subtype) {
            headerTags.push(
              <Tag key="subtype" color="geekblue">
                {entry.subtype}
              </Tag>,
            )
          }

          const parts = normalizeContentParts(entry.message?.content)
          const key = getStableEntryKey(entry, idx)

          if (entry.type === "system" && entry.subtype === "init") {
            const sessionId = entry.session_id ?? entry.sessionId
            const model = (entry as any)?.model || entry.message?.model
            const cwd = entry.cwd
            return (
              <Flex key={key} justify="center">
                <Card size="small" styles={{ body: { padding: token.paddingXS } }}>
                  <Flex gap={8} align="center" wrap>
                    <Tag>system:init</Tag>
                    {model ? <Text type="secondary">{model}</Text> : null}
                    {cwd ? <Text type="secondary">{cwd}</Text> : null}
                    {sessionId ? <Text type="secondary">{sessionId}</Text> : null}
                  </Flex>
                </Card>
              </Flex>
            )
          }

          if (role === "system") {
            const maybeText = extractTextFromParts(parts).join("\n").trim()
            if (!maybeText) {
              return null
            }
            return (
              <Flex key={key} justify="center">
                <Card size="small" styles={{ body: { padding: token.paddingXS } }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {maybeText}
                  </Text>
                </Card>
              </Flex>
            )
          }

          return (
            <Flex key={key} justify={align}>
              <div style={{ width: "min(780px, 100%)" }}>
                <Card
                  size="small"
                  styles={{ body: { padding: token.paddingSM } }}
                  style={{
                    borderRadius: token.borderRadiusLG,
                    background: bubbleBg,
                    border:
                      role === "user"
                        ? `1px solid ${token.colorPrimaryBorder}`
                        : `1px solid ${token.colorBorderSecondary}`,
                  }}
                >
                  <Flex vertical gap={8}>
                    <Flex align="center" gap={8} wrap style={{ minWidth: 0 }}>
                      {headerTags}
                      {entry.timestamp ? (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {entry.timestamp}
                        </Text>
                      ) : null}
                    </Flex>

                    {parts.length ? (
                      role === "assistant"
                        ? renderAssistantParts(parts, toolResults, key)
                        : renderAssistantParts(
                            parts.filter((p) => isTextPart(p)),
                            toolResults,
                            key,
                          )
                    ) : null}
                  </Flex>
                </Card>
              </div>
            </Flex>
          )
        })}
      </Flex>
    </div>
  )
}
