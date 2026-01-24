import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  FloatButton,
  Card,
  Collapse,
  Flex,
  Tag,
  Typography,
  theme,
  Radio,
  Checkbox,
  Input,
  Button,
  Space,
} from "antd"
import { DownOutlined } from "@ant-design/icons"
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

type AskUserQuestionOption = {
  label?: string
  value?: string
  description?: string
}

type AskUserQuestionSpec = {
  id: string
  header?: string
  question?: string
  multiSelect?: boolean
  allowCustom?: boolean
  options: AskUserQuestionOption[]
}

const normalizeToolName = (value?: string | null): string => {
  if (!value) return ""
  return value.toLowerCase().replace(/[^a-z0-9]/g, "")
}

const isAskUserQuestionTool = (
  part: Extract<ClaudeContentPart, { type: "tool_use" }>,
): boolean => normalizeToolName(part.name) === "askuserquestion"

type SystemInitMeta = {
  sessionId?: string
  model?: string
  cwd?: string
  tools: string[]
  rawDetails?: any
  extraFields: Array<{ label: string; value: string }>
}

const toToolList = (value: any): string[] => {
  if (!Array.isArray(value)) return []
  return value.filter((item) => typeof item === "string") as string[]
}

const extractSystemInitMeta = (entry: ClaudeStreamMessage): SystemInitMeta => {
  const sessionId = entry.session_id ?? entry.sessionId ?? undefined
  const model = entry.message?.model ?? (entry as any)?.model
  const cwd = entry.cwd ?? (entry as any)?.working_directory ?? undefined
  const rawContent = entry.message?.content
  let tools: string[] = []
  let extraFields: Array<{ label: string; value: string }> = []

  if (rawContent && typeof rawContent === "object" && !Array.isArray(rawContent)) {
    const contentTools = toToolList((rawContent as any).tools)
    const contentToolNames = toToolList((rawContent as any).tool_names)
    if (contentTools.length) {
      tools = contentTools
    } else if (contentToolNames.length) {
      tools = contentToolNames
    }

    extraFields = Object.entries(rawContent)
      .filter(([key, value]) => {
        if (key === "tools" || key === "tool_names" || key === "tool_config") return false
        return (
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        )
      })
      .map(([key, value]) => ({ label: key, value: String(value) }))
  }

  const entryTools = toToolList((entry as any)?.tools)
  if (entryTools.length) {
    tools = entryTools
  }

  return {
    sessionId,
    model,
    cwd,
    tools,
    rawDetails: rawContent,
    extraFields,
  }
}

const formatMcpToolName = (toolName: string): { provider: string; method: string } => {
  const withoutPrefix = toolName.replace(/^mcp__/, "")
  const parts = withoutPrefix.split("__")
  if (parts.length >= 2) {
    const provider = parts[0]
      .replace(/_/g, " ")
      .replace(/-/g, " ")
      .split(" ")
      .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
      .join(" ")
    const method = parts
      .slice(1)
      .join("__")
      .replace(/_/g, " ")
      .split(" ")
      .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
      .join(" ")
    return { provider, method }
  }
  return {
    provider: "MCP",
    method: withoutPrefix
      .replace(/_/g, " ")
      .split(" ")
      .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
      .join(" "),
  }
}

const SystemInitCard: React.FC<{ entry: ClaudeStreamMessage }> = ({ entry }) => {
  const { token } = theme.useToken()
  const { sessionId, model, cwd, tools, rawDetails, extraFields } = useMemo(
    () => extractSystemInitMeta(entry),
    [entry],
  )

  const regularTools = useMemo(
    () => tools.filter((tool) => !tool.startsWith("mcp__")),
    [tools],
  )
  const mcpTools = useMemo(
    () => tools.filter((tool) => tool.startsWith("mcp__")),
    [tools],
  )

  const mcpGroups = useMemo(() => {
    const groups = new Map<string, string[]>()
    mcpTools.forEach((tool) => {
      const { provider } = formatMcpToolName(tool)
      const list = groups.get(provider) ?? []
      list.push(tool)
      groups.set(provider, list)
    })
    return Array.from(groups.entries())
  }, [mcpTools])

  const showRaw =
    (typeof rawDetails === "string" && rawDetails.trim().length > 0) ||
    (rawDetails &&
      typeof rawDetails === "object" &&
      (!Array.isArray(rawDetails) || rawDetails.length > 0))

  return (
    <Card
      size="small"
      styles={{ body: { padding: token.paddingSM } }}
      style={{
        background: token.colorPrimaryBg,
        border: `1px solid ${token.colorPrimaryBorder}`,
      }}
    >
      <Flex vertical gap={token.marginSM}>
        <Flex gap={8} align="center" wrap>
          <Tag color="blue">System Initialized</Tag>
          {entry.timestamp ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {entry.timestamp}
            </Text>
          ) : null}
        </Flex>

        <Flex vertical gap={6}>
          {sessionId ? (
            <Flex gap={8} align="center" wrap>
              <Text type="secondary">Session ID</Text>
              <Text code>{sessionId}</Text>
            </Flex>
          ) : null}
          {model ? (
            <Flex gap={8} align="center" wrap>
              <Text type="secondary">Model</Text>
              <Text code>{model}</Text>
            </Flex>
          ) : null}
          {cwd ? (
            <Flex gap={8} align="center" wrap>
              <Text type="secondary">Working Directory</Text>
              <Text code>{cwd}</Text>
            </Flex>
          ) : null}
          {extraFields.length ? (
            <Flex vertical gap={4}>
              {extraFields.map((field) => (
                <Flex key={field.label} gap={8} align="center" wrap>
                  <Text type="secondary">{field.label}</Text>
                  <Text code>{field.value}</Text>
                </Flex>
              ))}
            </Flex>
          ) : null}
        </Flex>

        {regularTools.length ? (
          <Flex vertical gap={6}>
            <Text type="secondary">
              Available Tools ({regularTools.length})
            </Text>
            <Flex gap={6} wrap>
              {regularTools.map((tool) => (
                <Tag key={tool}>{tool}</Tag>
              ))}
            </Flex>
          </Flex>
        ) : null}

        {mcpGroups.length ? (
          <Collapse
            size="small"
            items={[
              {
                key: "mcp",
                label: `MCP Services (${mcpTools.length})`,
                children: (
                  <Flex vertical gap={token.marginSM}>
                    {mcpGroups.map(([provider, providerTools]) => (
                      <Flex key={provider} vertical gap={6}>
                        <Text type="secondary">{provider}</Text>
                        <Flex gap={6} wrap>
                          {providerTools.map((tool) => {
                            const { method } = formatMcpToolName(tool)
                            return <Tag key={tool}>{method}</Tag>
                          })}
                        </Flex>
                      </Flex>
                    ))}
                  </Flex>
                ),
              },
            ]}
          />
        ) : null}

        {showRaw ? (
          <Collapse
            size="small"
            items={[
              {
                key: "raw",
                label: "Details",
                children: (
                  <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
                    {typeof rawDetails === "string"
                      ? rawDetails
                      : formatJson(rawDetails)}
                  </pre>
                ),
              },
            ]}
          />
        ) : null}
      </Flex>
    </Card>
  )
}

const parseAskUserQuestions = (input: any): AskUserQuestionSpec[] => {
  if (!input || typeof input !== "object") return []
  const rawQuestions: any[] = Array.isArray(input.questions)
    ? input.questions
    : [input]
  const parsed = rawQuestions.map((q: any, idx: number): AskUserQuestionSpec => {
      const options: AskUserQuestionOption[] = Array.isArray(q?.options)
        ? q.options.map((opt: any) => ({
            label: opt?.label ?? opt?.value ?? opt?.id ?? String(opt),
            value: opt?.value ?? opt?.label ?? opt?.id ?? String(opt),
            description: opt?.description,
          }))
        : []
      return {
        id: String(q?.id ?? q?.key ?? idx),
        header: q?.header ?? q?.title,
        question: q?.question ?? q?.prompt,
        multiSelect: Boolean(q?.multiSelect ?? q?.multi_select),
        allowCustom: Boolean(q?.allowCustom ?? q?.allow_custom),
        options,
      }
    })
  return parsed.filter((q) => q.options.length || q.question || q.header)
}

const buildAskUserPrompt = (
  toolUseId: string | undefined,
  questions: AskUserQuestionSpec[],
  answers: Record<string, string[]>,
  customAnswers: Record<string, string>,
): string => {
  const normalized = questions.map((q) => {
    const selected = answers[q.id] ?? []
    const custom = customAnswers[q.id]?.trim()
    return {
      id: q.id,
      header: q.header,
      question: q.question,
      answers: custom ? [...selected, custom] : selected,
    }
  })
  if (questions.length === 1) {
    const only = normalized[0]
    if (only.answers.length === 1 && !only.question && !only.header) {
      return only.answers[0]
    }
  }
  return JSON.stringify(
    {
      tool: "AskUserQuestion",
      tool_use_id: toolUseId,
      responses: normalized,
    },
    null,
    2,
  )
}

const AskUserQuestionBlock: React.FC<{
  part: Extract<ClaudeContentPart, { type: "tool_use" }>
  toolResult?: any
  sessionId?: string
  onAnswer?: (payload: { prompt: string; sessionId?: string }) => void
  isRunning?: boolean
}> = ({ part, toolResult, sessionId, onAnswer, isRunning }) => {
  const { token } = theme.useToken()
  const questions = useMemo(() => parseAskUserQuestions(part.input), [part.input])
  const [answers, setAnswers] = useState<Record<string, string[]>>({})
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({})

  const hasResult = Boolean(toolResult)
  const disabled = hasResult || !onAnswer

  const handleSingleSelect = useCallback((qid: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [qid]: value ? [value] : [] }))
  }, [])

  const handleMultiSelect = useCallback((qid: string, values: string[]) => {
    setAnswers((prev) => ({ ...prev, [qid]: values }))
  }, [])

  const handleCustomChange = useCallback((qid: string, value: string) => {
    setCustomAnswers((prev) => ({ ...prev, [qid]: value }))
  }, [])

  const isSubmitDisabled = useMemo(() => {
    if (disabled || questions.length === 0) return true
    return questions.every((q) => {
      const selected = answers[q.id]?.filter(Boolean) ?? []
      const custom = customAnswers[q.id]?.trim()
      return selected.length === 0 && !custom
    })
  }, [answers, customAnswers, disabled, questions])

  const handleSubmit = useCallback(() => {
    if (!onAnswer) return
    const prompt = buildAskUserPrompt(
      part.id,
      questions,
      answers,
      customAnswers,
    )
    onAnswer({ prompt, sessionId })
  }, [answers, customAnswers, onAnswer, part.id, questions, sessionId])

  return (
    <Card size="small" styles={{ body: { padding: 12 } }}>
      <Flex vertical gap={12}>
        <Flex gap={8} align="center" wrap>
          <Tag color="purple">AskUserQuestion</Tag>
          {part.id ? <Text type="secondary">#{part.id}</Text> : null}
          {isRunning ? <Tag color="processing">Running</Tag> : null}
        </Flex>
        {questions.map((q) => {
          const values = answers[q.id] ?? []
          return (
            <Card
              key={q.id}
              size="small"
              styles={{ body: { padding: 12 } }}
              style={{ background: token.colorBgLayout }}
            >
              <Flex vertical gap={8}>
                {q.header ? <Text strong>{q.header}</Text> : null}
                {q.question ? <Text>{q.question}</Text> : null}
                {q.multiSelect ? (
                  <Checkbox.Group
                    value={values}
                    onChange={(vals) =>
                      handleMultiSelect(q.id, vals as string[])
                    }
                    disabled={disabled}
                  >
                    <Space direction="vertical" style={{ width: "100%" }}>
                      {q.options.map((opt, idx) => {
                        const value = opt.value ?? opt.label ?? String(idx)
                        return (
                          <Checkbox key={value} value={value}>
                            <Flex vertical>
                              <Text strong>{opt.label ?? value}</Text>
                              {opt.description ? (
                                <Text type="secondary">
                                  {opt.description}
                                </Text>
                              ) : null}
                            </Flex>
                          </Checkbox>
                        )
                      })}
                    </Space>
                  </Checkbox.Group>
                ) : (
                  <Radio.Group
                    value={values[0]}
                    onChange={(e) => handleSingleSelect(q.id, e.target.value)}
                    disabled={disabled}
                  >
                    <Space direction="vertical" style={{ width: "100%" }}>
                      {q.options.map((opt, idx) => {
                        const value = opt.value ?? opt.label ?? String(idx)
                        return (
                          <Radio key={value} value={value}>
                            <Flex vertical>
                              <Text strong>{opt.label ?? value}</Text>
                              {opt.description ? (
                                <Text type="secondary">
                                  {opt.description}
                                </Text>
                              ) : null}
                            </Flex>
                          </Radio>
                        )
                      })}
                    </Space>
                  </Radio.Group>
                )}
                {q.allowCustom ? (
                  <Input.TextArea
                    value={customAnswers[q.id] ?? ""}
                    onChange={(e) => handleCustomChange(q.id, e.target.value)}
                    placeholder="Custom answer"
                    autoSize={{ minRows: 2, maxRows: 6 }}
                    disabled={disabled}
                  />
                ) : null}
              </Flex>
            </Card>
          )
        })}
        {hasResult ? (
          <Card size="small" styles={{ body: { padding: 10 } }}>
            <Text type="secondary">Answer submitted.</Text>
          </Card>
        ) : null}
        <Flex justify="flex-end">
          <Button type="primary" onClick={handleSubmit} disabled={isSubmitDisabled}>
            Submit Answer
          </Button>
        </Flex>
      </Flex>
    </Card>
  )
}

type ToolDetailRow = {
  label: string
  value?: string
  code?: boolean
}

const ToolKeyValueList: React.FC<{ rows: ToolDetailRow[] }> = ({ rows }) => {
  const filtered = rows.filter((row) => row.value && row.value.trim().length)
  if (!filtered.length) return null
  return (
    <Flex vertical gap={4}>
      {filtered.map((row, idx) => (
        <Flex key={`${row.label}-${idx}`} gap={8} align="center" wrap>
          <Text type="secondary" style={{ minWidth: 110 }}>
            {row.label}
          </Text>
          {row.code ? <Text code>{row.value}</Text> : <Text>{row.value}</Text>}
        </Flex>
      ))}
    </Flex>
  )
}

const ToolUseDetails: React.FC<{
  part: Extract<ClaudeContentPart, { type: "tool_use" }>
}> = ({ part }) => {
  const input = part.input
  if (!input || typeof input !== "object") return null
  const tool = normalizeToolName(part.name)
  const toolName = part.name ?? ""

  if (toolName.startsWith("mcp__")) {
    const { provider, method } = formatMcpToolName(toolName)
    const inputString =
      input && Object.keys(input).length ? JSON.stringify(input, null, 2) : ""
    return (
      <Card size="small" styles={{ body: { padding: 10 } }}>
        <Flex vertical gap={6}>
          <Text strong>MCP Tool</Text>
          <ToolKeyValueList
            rows={[
              { label: "Provider", value: provider },
              { label: "Method", value: method, code: true },
            ]}
          />
          {inputString ? (
            <Collapse
              size="small"
              items={[
                {
                  key: "mcp_input",
                  label: "Parameters",
                  children: (
                    <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
                      {inputString}
                    </pre>
                  ),
                },
              ]}
            />
          ) : null}
        </Flex>
      </Card>
    )
  }

  if (tool === "task") {
    const description = (input as any).description ?? (input as any).task
    const prompt = (input as any).prompt ?? (input as any).instructions
    return (
      <Card size="small" styles={{ body: { padding: 10 } }}>
        <Flex vertical gap={8}>
          <Text strong>Spawning Sub-Agent Task</Text>
          {description ? (
            <Card size="small" styles={{ body: { padding: 10 } }}>
              <Text type="secondary">Task Description</Text>
              <div style={{ marginTop: 4 }}>
                <Text>{String(description)}</Text>
              </div>
            </Card>
          ) : null}
          {prompt ? (
            <Collapse
              size="small"
              items={[
                {
                  key: "task_prompt",
                  label: "Task Instructions",
                  children: (
                    <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
                      {String(prompt)}
                    </pre>
                  ),
                },
              ]}
            />
          ) : null}
        </Flex>
      </Card>
    )
  }

  if (tool === "bash") {
    const command = (input as any).command ?? (input as any).cmd
    const description = (input as any).description
    return (
      <Card size="small" styles={{ body: { padding: 10 } }}>
        <Flex vertical gap={6}>
          <Text strong>Shell Command</Text>
          <ToolKeyValueList
            rows={[
              { label: "Command", value: command ? String(command) : "", code: true },
              { label: "Description", value: description ? String(description) : "" },
            ]}
          />
        </Flex>
      </Card>
    )
  }

  if (tool === "websearch" || tool === "websearchquery") {
    const query = (input as any).query ?? (input as any).q
    return (
      <Card size="small" styles={{ body: { padding: 10 } }}>
        <Flex vertical gap={6}>
          <Text strong>Web Search</Text>
          <ToolKeyValueList rows={[{ label: "Query", value: query ? String(query) : "" }]} />
        </Flex>
      </Card>
    )
  }

  if (tool === "webfetch") {
    const url = (input as any).url
    const prompt = (input as any).prompt
    return (
      <Card size="small" styles={{ body: { padding: 10 } }}>
        <Flex vertical gap={6}>
          <Text strong>Web Fetch</Text>
          <ToolKeyValueList
            rows={[
              { label: "URL", value: url ? String(url) : "", code: true },
              { label: "Prompt", value: prompt ? String(prompt) : "" },
            ]}
          />
        </Flex>
      </Card>
    )
  }

  if (
    tool === "read" ||
    tool === "ls" ||
    tool === "write" ||
    tool === "edit" ||
    tool === "multiedit"
  ) {
    const path = (input as any).path ?? (input as any).file_path ?? (input as any).file
    const pattern = (input as any).pattern
    const description = (input as any).description
    const rows: ToolDetailRow[] = [
      { label: "Path", value: path ? String(path) : "", code: true },
      { label: "Pattern", value: pattern ? String(pattern) : "" },
      { label: "Description", value: description ? String(description) : "" },
    ].filter((row) => row.value && row.value.trim().length)
    if (!rows.length) return null
    return (
      <Card size="small" styles={{ body: { padding: 10 } }}>
        <Flex vertical gap={6}>
          <Text strong>{part.name || "Tool"}</Text>
          <ToolKeyValueList rows={rows} />
        </Flex>
      </Card>
    )
  }

  const summaryKeys = ["path", "file_path", "query", "url", "command", "pattern"]
  const rows = summaryKeys
    .map((key) => {
      const value = (input as any)[key]
      return value ? { label: key, value: String(value), code: key.includes("path") } : null
    })
    .filter(Boolean) as ToolDetailRow[]

  if (!rows.length) return null
  return (
    <Card size="small" styles={{ body: { padding: 10 } }}>
      <ToolKeyValueList rows={rows} />
    </Card>
  )
}

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
      <div style={{ marginTop: 8 }}>
        <ToolUseDetails part={part} />
      </div>
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

const tryParseJson = (value: string): any | null => {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

type TreeNode = {
  name: string
  type: "file" | "directory"
  children: TreeNode[]
}

const parseDirectoryTree = (rawContent: string): TreeNode[] => {
  const lines = rawContent.split("\n")
  const roots: TreeNode[] = []
  const stack: Array<{ level: number; node: TreeNode }> = []

  for (const line of lines) {
    if (line.startsWith("NOTE:")) break
    if (!line.trim()) continue
    const indentMatch = line.match(/^(\s*)/)?.[1] ?? ""
    const level = Math.floor(indentMatch.length / 2)
    const entryMatch = line.match(/^\s*-\s+(.+?)(\/$)?$/)
    if (!entryMatch) continue
    const fullName = entryMatch[1]
    const isDirectory = line.trim().endsWith("/")
    const node: TreeNode = {
      name: fullName,
      type: isDirectory ? "directory" : "file",
      children: [],
    }

    while (stack.length && stack[stack.length - 1].level >= level) {
      stack.pop()
    }
    if (stack.length) {
      stack[stack.length - 1].node.children.push(node)
    } else {
      roots.push(node)
    }
    if (isDirectory) {
      stack.push({ level, node })
    }
  }

  return roots
}

const renderTreeNodes = (nodes: TreeNode[], level = 0): React.ReactNode => {
  return nodes.map((node, idx) => (
    <div key={`${node.name}-${level}-${idx}`} style={{ marginLeft: level * 16 }}>
      <Flex align="center" gap={6}>
        <Text code>{node.type === "directory" ? "dir" : "file"}</Text>
        <Text style={{ fontFamily: "monospace" }}>{node.name}</Text>
      </Flex>
      {node.children.length ? renderTreeNodes(node.children, level + 1) : null}
    </div>
  ))
}

const parseNumberedCode = (
  rawContent: string,
): { code: string; startLine: number } => {
  const lines = rawContent.split("\n")
  const nonEmpty = lines.filter((line) => line.trim() !== "")
  if (!nonEmpty.length) {
    return { code: rawContent, startLine: 1 }
  }

  const numberedLines = nonEmpty.filter((line) => /^\s*\d+→/.test(line)).length
  const likelyNumbered = numberedLines / nonEmpty.length > 0.5
  if (!likelyNumbered) {
    return { code: rawContent, startLine: 1 }
  }

  const codeLines: string[] = []
  let minLine = Number.POSITIVE_INFINITY

  for (const rawLine of lines) {
    const trimmed = rawLine.trimStart()
    const match = trimmed.match(/^(\d+)→(.*)$/)
    if (match) {
      const lineNumber = parseInt(match[1], 10)
      if (minLine === Number.POSITIVE_INFINITY) {
        minLine = lineNumber
      }
      codeLines.push(match[2])
    } else if (rawLine.trim() === "") {
      codeLines.push("")
    } else {
      codeLines.push("")
    }
  }

  while (codeLines.length && codeLines[codeLines.length - 1] === "") {
    codeLines.pop()
  }

  return {
    code: codeLines.join("\n"),
    startLine: minLine === Number.POSITIVE_INFINITY ? 1 : minLine,
  }
}

const parseEditResult = (
  rawContent: string,
): { filePath: string; code: string; startLine: number } | null => {
  const lines = rawContent.split("\n")
  let filePath = ""
  const codeLines: string[] = []
  let minLine = Number.POSITIVE_INFINITY
  let inCode = false

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "")
    if (line.includes("The file") && line.includes("has been updated")) {
      const match = line.match(/The file (.+) has been updated/)
      if (match) {
        filePath = match[1]
      }
      continue
    }
    const match =
      line.match(/^\s*(\d+)→(.*)$/) || line.match(/^\s*(\d+)\t?(.*)$/)
    if (match) {
      inCode = true
      const lineNumber = parseInt(match[1], 10)
      if (minLine === Number.POSITIVE_INFINITY) {
        minLine = lineNumber
      }
      codeLines.push(match[2])
      continue
    }
    if (inCode) {
      if (line.trim() === "") {
        codeLines.push("")
      }
    }
  }

  if (!codeLines.length) return null
  return {
    filePath,
    code: codeLines.join("\n"),
    startLine: minLine === Number.POSITIVE_INFINITY ? 1 : minLine,
  }
}

const parseMultiEditResult = (
  rawContent: string,
): Array<{ filePath: string; code: string; startLine: number }> => {
  const sections: Array<{ filePath: string; code: string; startLine: number }> = []
  const lines = rawContent.split("\n")
  let currentBlock: string[] = []

  const flushBlock = () => {
    if (!currentBlock.length) return
    const blockContent = currentBlock.join("\n")
    const parsed = parseEditResult(blockContent)
    if (parsed) {
      sections.push(parsed)
    }
    currentBlock = []
  }

  for (const line of lines) {
    if (line.includes("The file") && line.includes("has been updated")) {
      flushBlock()
    }
    currentBlock.push(line)
  }
  flushBlock()
  return sections
}

const NumberedCodeBlock: React.FC<{
  code: string
  startLine: number
  header?: React.ReactNode
}> = ({ code, startLine, header }) => {
  const lines = code.split("\n")
  return (
    <Card size="small" styles={{ body: { padding: 0 } }}>
      {header ? (
        <div style={{ padding: "8px 12px", borderBottom: "1px solid #303030" }}>
          {header}
        </div>
      ) : null}
      <div style={{ maxHeight: 440, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={`${idx}-${line}`}>
                <td
                  style={{
                    width: 56,
                    textAlign: "right",
                    padding: "0 12px",
                    opacity: 0.6,
                    fontSize: 12,
                    fontFamily: "monospace",
                  }}
                >
                  {startLine + idx}
                </td>
                <td
                  style={{
                    padding: "0 12px",
                    fontSize: 12,
                    fontFamily: "monospace",
                    whiteSpace: "pre",
                  }}
                >
                  {line}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

const getToolResultText = (value: any): string => {
  if (value === undefined || value === null) return ""
  if (typeof value === "string") return value
  if (typeof value === "object") {
    if (typeof (value as any).result === "string") return (value as any).result
    if (typeof (value as any).output === "string") return (value as any).output
  }
  return formatJson(value)
}

const ToolResultDetails: React.FC<{
  toolUse?: Extract<ClaudeContentPart, { type: "tool_use" }>
  part: any
}> = ({ toolUse, part }) => {
  const tool = normalizeToolName(toolUse?.name)
  const content = part?.content
  const text = getToolResultText(content)
  const parsedJson = typeof text === "string" ? tryParseJson(text) : null

  if (!tool) {
    return null
  }

  if (tool === "ls") {
    const nodes = parseDirectoryTree(text)
    return (
      <Card size="small" styles={{ body: { padding: 10 } }}>
        <Flex vertical gap={6}>
          <Text strong>Directory Listing</Text>
          {nodes.length ? (
            <div>{renderTreeNodes(nodes)}</div>
          ) : (
            <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
              {text}
            </pre>
          )}
        </Flex>
      </Card>
    )
  }

  if (tool === "read") {
    const path =
      toolUse?.input?.path ?? toolUse?.input?.file_path ?? toolUse?.input?.file
    const parsed = parseNumberedCode(text)
    return (
      <NumberedCodeBlock
        code={parsed.code}
        startLine={parsed.startLine}
        header={
          <Flex gap={8} align="center" wrap>
            <Text strong>File Content</Text>
            {path ? <Text code>{String(path)}</Text> : null}
          </Flex>
        }
      />
    )
  }

  if (tool === "edit") {
    const path =
      toolUse?.input?.path ?? toolUse?.input?.file_path ?? toolUse?.input?.file
    const parsed = parseEditResult(text)
    if (parsed) {
      return (
        <NumberedCodeBlock
          code={parsed.code}
          startLine={parsed.startLine}
          header={
            <Flex gap={8} align="center" wrap>
              <Text strong>Edit Result</Text>
              {parsed.filePath ? <Text code>{parsed.filePath}</Text> : null}
              {!parsed.filePath && path ? <Text code>{String(path)}</Text> : null}
            </Flex>
          }
        />
      )
    }
    return (
      <Card size="small" styles={{ body: { padding: 10 } }}>
        <Flex vertical gap={6}>
          <Text strong>Edit Result</Text>
          {path ? (
            <Text type="secondary" code>
              {String(path)}
            </Text>
          ) : null}
          <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
            {text}
          </pre>
        </Flex>
      </Card>
    )
  }

  if (tool === "multiedit") {
    const sections = parseMultiEditResult(text)
    if (sections.length) {
      return (
        <Flex vertical gap={12}>
          {sections.map((section, idx) => (
            <NumberedCodeBlock
              key={`${section.filePath}-${idx}`}
              code={section.code}
              startLine={section.startLine}
              header={
                <Flex gap={8} align="center" wrap>
                  <Text strong>Multi-Edit Result</Text>
                  {section.filePath ? <Text code>{section.filePath}</Text> : null}
                </Flex>
              }
            />
          ))}
        </Flex>
      )
    }
    return (
      <Card size="small" styles={{ body: { padding: 10 } }}>
        <Text strong>Multi-Edit Result</Text>
        <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
          {text}
        </pre>
      </Card>
    )
  }

  if (tool === "write") {
    const path =
      toolUse?.input?.path ?? toolUse?.input?.file_path ?? toolUse?.input?.file
    return (
      <Card size="small" styles={{ body: { padding: 10 } }}>
        <Flex vertical gap={6}>
          <Text strong>Write Result</Text>
          {path ? (
            <Text type="secondary" code>
              {String(path)}
            </Text>
          ) : null}
          <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
            {text}
          </pre>
        </Flex>
      </Card>
    )
  }

  if (tool === "bash") {
    return (
      <Card size="small" styles={{ body: { padding: 10 } }}>
        <Text strong>Command Output</Text>
        <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
          {text}
        </pre>
      </Card>
    )
  }

  if (tool === "websearch") {
    return (
      <Card size="small" styles={{ body: { padding: 10 } }}>
        <Text strong>Search Results</Text>
        <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
          {text}
        </pre>
      </Card>
    )
  }

  if (tool === "webfetch") {
    return (
      <Card size="small" styles={{ body: { padding: 10 } }}>
        <Text strong>Fetched Content</Text>
        <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
          {text}
        </pre>
      </Card>
    )
  }

  if (parsedJson) {
    return (
      <Card size="small" styles={{ body: { padding: 10 } }}>
        <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
          {formatJson(parsedJson)}
        </pre>
      </Card>
    )
  }

  return null
}

const ToolResultBlock: React.FC<{ part: any; toolUse?: Extract<ClaudeContentPart, { type: "tool_use" }> }> = ({
  part,
  toolUse,
}) => {
  const isError = Boolean(part?.is_error)
  return (
    <Card size="small" styles={{ body: { padding: 10 } }}>
      <Flex gap={8} align="center" wrap>
        <Tag color={isError ? "red" : "green"}>tool_result</Tag>
      </Flex>
      <div style={{ marginTop: 8 }}>
        <ToolResultDetails toolUse={toolUse} part={part} />
      </div>
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
  sessionId?: string,
  onAskUserAnswer?: (payload: { prompt: string; sessionId?: string }) => void,
  isRunning?: boolean,
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
          if (isAskUserQuestionTool(part)) {
            return (
              <AskUserQuestionBlock
                key={key}
                part={part}
                toolResult={result}
                sessionId={sessionId}
                onAnswer={onAskUserAnswer}
                isRunning={isRunning}
              />
            )
          }
          return (
            <Flex key={key} vertical gap={8}>
              <ToolUseBlock part={part} />
              {result ? <ToolResultBlock part={result} toolUse={part} /> : null}
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

const isSystemInitEntry = (entry: ClaudeStreamMessage): boolean =>
  entry.type === "system" && entry.subtype === "init"

export const AgentChatView: React.FC<{
  entries: ClaudeStreamMessage[]
  autoScrollToken?: any
  onAskUserAnswer?: (payload: { prompt: string; sessionId?: string }) => void
  isRunning?: boolean
}> = ({ entries, autoScrollToken, onAskUserAnswer, isRunning }) => {
  const { token } = theme.useToken()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)

  const toolResults = useMemo(() => buildToolResultsMap(entries), [entries])

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [])

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const threshold = 48
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    setShowScrollToBottom(distance > threshold)
  }, [])

  useEffect(() => {
    if (autoScrollToken === undefined) return
    scrollToBottom()
    setShowScrollToBottom(false)
  }, [autoScrollToken, scrollToBottom])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateScrollState()
    el.addEventListener("scroll", updateScrollState, { passive: true })
    return () => {
      el.removeEventListener("scroll", updateScrollState)
    }
  }, [updateScrollState, entries.length])

  return (
    <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
      <div
        ref={scrollRef}
        style={{
          height: "100%",
          overflow: "auto",
          padding: token.paddingSM,
          background: token.colorBgContainer,
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
              role === "user" ? token.colorPrimaryBg : token.colorBgElevated
            const headerTags: React.ReactNode[] = []
            headerTags.push(
              <Tag
                key="type"
                color={
                  role === "user" ? "blue" : role === "assistant" ? "purple" : "default"
                }
              >
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
            const sessionId = entry.session_id ?? entry.sessionId

            if (isSystemInitEntry(entry)) {
              return (
                <Flex key={key} justify="center">
                  <div style={{ width: "min(780px, 100%)" }}>
                    <SystemInitCard entry={entry} />
                  </div>
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
                          ? renderAssistantParts(
                              parts,
                              toolResults,
                              key,
                              sessionId,
                              onAskUserAnswer,
                              isRunning,
                            )
                          : renderAssistantParts(
                              parts.filter((p) => isTextPart(p)),
                              toolResults,
                              key,
                              sessionId,
                              onAskUserAnswer,
                              isRunning,
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
      {showScrollToBottom ? (
        <FloatButton
          type="primary"
          icon={<DownOutlined />}
          onClick={scrollToBottom}
          style={{
            position: "absolute",
            right: token.marginSM,
            bottom: token.marginSM,
            boxShadow: token.boxShadowSecondary,
          }}
        />
      ) : null}
    </div>
  )
}
