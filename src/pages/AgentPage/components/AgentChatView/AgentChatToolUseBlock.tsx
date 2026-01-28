import React, { useMemo } from "react";
import { Card, Collapse, Flex, Tag, Typography } from "antd";

import type { ClaudeContentPart } from "../ClaudeStream";
import { formatJson } from "./agentChatFormatters";
import { formatMcpToolName, normalizeToolName } from "./agentChatToolUtils";

const { Text } = Typography;

type ToolDetailRow = {
  label: string;
  value?: string;
  code?: boolean;
};

const ToolKeyValueList: React.FC<{ rows: ToolDetailRow[] }> = ({ rows }) => {
  const filtered = rows.filter((row) => row.value && row.value.trim().length);
  if (!filtered.length) return null;
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
  );
};

const ToolUseDetails: React.FC<{
  part: Extract<ClaudeContentPart, { type: "tool_use" }>;
}> = ({ part }) => {
  const input = part.input;
  if (!input || typeof input !== "object") return null;
  const tool = normalizeToolName(part.name);
  const toolName = part.name ?? "";

  if (toolName.startsWith("mcp__")) {
    const { provider, method } = formatMcpToolName(toolName);
    const inputString =
      input && Object.keys(input).length ? JSON.stringify(input, null, 2) : "";
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
                    <pre
                      style={{
                        margin: 0,
                        fontSize: 12,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {inputString}
                    </pre>
                  ),
                },
              ]}
            />
          ) : null}
        </Flex>
      </Card>
    );
  }

  if (tool === "task") {
    const description = (input as any).description ?? (input as any).task;
    const prompt = (input as any).prompt ?? (input as any).instructions;
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
                    <pre
                      style={{
                        margin: 0,
                        fontSize: 12,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {String(prompt)}
                    </pre>
                  ),
                },
              ]}
            />
          ) : null}
        </Flex>
      </Card>
    );
  }

  if (tool === "bash") {
    const command = (input as any).command ?? (input as any).cmd;
    const description = (input as any).description;
    return (
      <Card size="small" styles={{ body: { padding: 10 } }}>
        <Flex vertical gap={6}>
          <Text strong>Shell Command</Text>
          <ToolKeyValueList
            rows={[
              {
                label: "Command",
                value: command ? String(command) : "",
                code: true,
              },
              {
                label: "Description",
                value: description ? String(description) : "",
              },
            ]}
          />
        </Flex>
      </Card>
    );
  }

  if (tool === "websearch" || tool === "websearchquery") {
    const query = (input as any).query ?? (input as any).q;
    return (
      <Card size="small" styles={{ body: { padding: 10 } }}>
        <Flex vertical gap={6}>
          <Text strong>Web Search</Text>
          <ToolKeyValueList
            rows={[{ label: "Query", value: query ? String(query) : "" }]}
          />
        </Flex>
      </Card>
    );
  }

  if (tool === "webfetch") {
    const url = (input as any).url;
    const prompt = (input as any).prompt;
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
    );
  }

  if (
    tool === "read" ||
    tool === "ls" ||
    tool === "write" ||
    tool === "edit" ||
    tool === "multiedit"
  ) {
    const path =
      (input as any).path ?? (input as any).file_path ?? (input as any).file;
    const pattern = (input as any).pattern;
    const description = (input as any).description;
    const rows: ToolDetailRow[] = [
      { label: "Path", value: path ? String(path) : "", code: true },
      { label: "Pattern", value: pattern ? String(pattern) : "" },
      { label: "Description", value: description ? String(description) : "" },
    ].filter((row) => row.value && row.value.trim().length);
    if (!rows.length) return null;
    return (
      <Card size="small" styles={{ body: { padding: 10 } }}>
        <Flex vertical gap={6}>
          <Text strong>{part.name || "Tool"}</Text>
          <ToolKeyValueList rows={rows} />
        </Flex>
      </Card>
    );
  }

  const summaryKeys = [
    "path",
    "file_path",
    "query",
    "url",
    "command",
    "pattern",
  ];
  const rows = summaryKeys
    .map((key) => {
      const value = (input as any)[key];
      return value
        ? { label: key, value: String(value), code: key.includes("path") }
        : null;
    })
    .filter(Boolean) as ToolDetailRow[];

  if (!rows.length) return null;
  return (
    <Card size="small" styles={{ body: { padding: 10 } }}>
      <ToolKeyValueList rows={rows} />
    </Card>
  );
};

export const AgentChatToolUseBlock: React.FC<{
  part: Extract<ClaudeContentPart, { type: "tool_use" }>;
}> = ({ part }) => {
  const summary = useMemo(() => {
    if (!part.input || typeof part.input !== "object") return null;
    const keys = Object.keys(part.input);
    if (!keys.length) return null;
    return keys.slice(0, 5).join(", ");
  }, [part.input]);

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
                <pre
                  style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}
                >
                  {formatJson(part.input)}
                </pre>
              ),
            },
          ]}
        />
      ) : null}
    </Card>
  );
};
