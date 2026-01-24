import React, { useMemo } from "react";
import { Card, Collapse, Flex, Tag, Typography, theme } from "antd";

import type { ClaudeStreamMessage } from "../ClaudeStream";
import { formatJson } from "./agentChatFormatters";
import { formatMcpToolName, toToolList } from "./agentChatToolUtils";

const { Text } = Typography;

type SystemInitMeta = {
  sessionId?: string;
  model?: string;
  cwd?: string;
  tools: string[];
  rawDetails?: any;
  extraFields: Array<{ label: string; value: string }>;
};

const extractSystemInitMeta = (entry: ClaudeStreamMessage): SystemInitMeta => {
  const sessionId = entry.session_id ?? entry.sessionId ?? undefined;
  const model = entry.message?.model ?? (entry as any)?.model;
  const cwd = entry.cwd ?? (entry as any)?.working_directory ?? undefined;
  const rawContent = entry.message?.content;
  let tools: string[] = [];
  let extraFields: Array<{ label: string; value: string }> = [];

  if (
    rawContent &&
    typeof rawContent === "object" &&
    !Array.isArray(rawContent)
  ) {
    const contentTools = toToolList((rawContent as any).tools);
    const contentToolNames = toToolList((rawContent as any).tool_names);
    if (contentTools.length) {
      tools = contentTools;
    } else if (contentToolNames.length) {
      tools = contentToolNames;
    }

    extraFields = Object.entries(rawContent)
      .filter(([key, value]) => {
        if (key === "tools" || key === "tool_names" || key === "tool_config")
          return false;
        return (
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        );
      })
      .map(([key, value]) => ({ label: key, value: String(value) }));
  }

  const entryTools = toToolList((entry as any)?.tools);
  if (entryTools.length) {
    tools = entryTools;
  }

  return {
    sessionId,
    model,
    cwd,
    tools,
    rawDetails: rawContent,
    extraFields,
  };
};

export const AgentChatSystemInitCard: React.FC<{
  entry: ClaudeStreamMessage;
}> = ({ entry }) => {
  const { token } = theme.useToken();
  const { sessionId, model, cwd, tools, rawDetails, extraFields } = useMemo(
    () => extractSystemInitMeta(entry),
    [entry],
  );

  const regularTools = useMemo(
    () => tools.filter((tool) => !tool.startsWith("mcp__")),
    [tools],
  );
  const mcpTools = useMemo(
    () => tools.filter((tool) => tool.startsWith("mcp__")),
    [tools],
  );

  const mcpGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    mcpTools.forEach((tool) => {
      const { provider } = formatMcpToolName(tool);
      const list = groups.get(provider) ?? [];
      list.push(tool);
      groups.set(provider, list);
    });
    return Array.from(groups.entries());
  }, [mcpTools]);

  const showRaw =
    (typeof rawDetails === "string" && rawDetails.trim().length > 0) ||
    (rawDetails &&
      typeof rawDetails === "object" &&
      (!Array.isArray(rawDetails) || rawDetails.length > 0));

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
                            const { method } = formatMcpToolName(tool);
                            return <Tag key={tool}>{method}</Tag>;
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
                  <pre
                    style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}
                  >
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
  );
};
