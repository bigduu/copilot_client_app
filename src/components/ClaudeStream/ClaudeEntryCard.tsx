import React, { useMemo } from "react";
import { Card, Collapse, Flex, Tag, Typography, theme } from "antd";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { createMarkdownComponents } from "../MessageCard/markdownComponents";
import type { ClaudeContentPart, ClaudeStreamMessage } from "./types";

const { Text } = Typography;

const formatJson = (value: any): string => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const normalizeContentParts = (value: any): ClaudeContentPart[] => {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.filter(Boolean) as ClaudeContentPart[];
  }

  if (typeof value === "string") {
    return [{ type: "text", text: value }];
  }

  if (typeof value === "object") {
    const obj: any = value;
    if (typeof obj.type !== "string" && typeof obj.text === "string") {
      return [{ ...obj, type: "text" } as ClaudeContentPart];
    }
    return [obj as ClaudeContentPart];
  }

  return [];
};

const getTextValue = (part: any): string => {
  const raw = part?.text;
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && typeof raw.text === "string")
    return raw.text;
  if (raw === undefined || raw === null) return "";
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
};

const getPrimaryText = (entry: ClaudeStreamMessage): string | null => {
  const parts = normalizeContentParts(entry.message?.content);
  const firstText = parts.find((p) => (p as any)?.type === "text") as
    | { text?: any }
    | undefined;
  const text = firstText ? getTextValue(firstText) : "";
  return text ? text : null;
};

const ClaudeMarkdown: React.FC<{ value: string }> = ({ value }) => {
  const { token } = theme.useToken();
  const components = useMemo(
    () => createMarkdownComponents(token, undefined),
    [token],
  );
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      rehypePlugins={[rehypeSanitize]}
      components={components}
    >
      {value}
    </ReactMarkdown>
  );
};

const ToolUseCard: React.FC<{
  part: Extract<ClaudeContentPart, { type: "tool_use" }>;
}> = ({ part }) => {
  return (
    <Card
      size="small"
      styles={{ body: { padding: 12 } }}
      style={{ background: "var(--ant-color-bg-layout)" }}
    >
      <Flex vertical gap={6}>
        <Flex gap={8} align="center" wrap>
          <Tag color="blue">tool_use</Tag>
          <Text strong>{part.name || "Tool"}</Text>
          {part.id ? <Text type="secondary">#{part.id}</Text> : null}
        </Flex>
        {part.input !== undefined ? (
          <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
            {formatJson(part.input)}
          </pre>
        ) : null}
      </Flex>
    </Card>
  );
};

const ToolResultCard: React.FC<{
  part: Extract<ClaudeContentPart, { type: "tool_result" }>;
}> = ({ part }) => {
  return (
    <Card
      size="small"
      styles={{ body: { padding: 12 } }}
      style={{ background: "var(--ant-color-bg-layout)" }}
    >
      <Flex vertical gap={6}>
        <Flex gap={8} align="center" wrap>
          <Tag color={part.is_error ? "red" : "green"}>tool_result</Tag>
          {part.tool_use_id ? (
            <Text type="secondary">tool_use_id={part.tool_use_id}</Text>
          ) : null}
        </Flex>
        {part.content !== undefined ? (
          typeof part.content === "string" ? (
            <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
              {part.content}
            </pre>
          ) : (
            <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
              {formatJson(part.content)}
            </pre>
          )
        ) : null}
      </Flex>
    </Card>
  );
};

const isTextPart = (
  part: ClaudeContentPart,
): part is Extract<ClaudeContentPart, { type: "text" }> =>
  (part as any)?.type === "text";

const isToolUsePart = (
  part: ClaudeContentPart,
): part is Extract<ClaudeContentPart, { type: "tool_use" }> =>
  (part as any)?.type === "tool_use";

const isToolResultPart = (
  part: ClaudeContentPart,
): part is Extract<ClaudeContentPart, { type: "tool_result" }> =>
  (part as any)?.type === "tool_result";

const renderPart = (part: ClaudeContentPart, key: string) => {
  if (isTextPart(part)) {
    const value = getTextValue(part);
    if (!value.trim()) return null;
    return (
      <div key={key} style={{ marginTop: 8 }}>
        <ClaudeMarkdown value={value} />
      </div>
    );
  }

  if (isToolUsePart(part)) {
    return <ToolUseCard key={key} part={part} />;
  }

  if (isToolResultPart(part)) {
    return <ToolResultCard key={key} part={part} />;
  }

  return (
    <pre key={key} style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
      {formatJson(part)}
    </pre>
  );
};

export const ClaudeEntryCard: React.FC<{ entry: ClaudeStreamMessage }> = ({
  entry,
}) => {
  const { token } = theme.useToken();

  const titleText = useMemo(() => {
    const text = getPrimaryText(entry);
    if (text) return text.split(/\r?\n/)[0]?.trim() || null;
    return null;
  }, [entry]);

  const tags = useMemo(() => {
    const items: Array<{ color?: string; value: string }> = [];
    items.push({ value: entry.type, color: "default" });
    if (entry.subtype) items.push({ value: entry.subtype, color: "purple" });
    if (entry.message?.role)
      items.push({ value: entry.message.role, color: "cyan" });
    if (entry.message?.model)
      items.push({ value: entry.message.model, color: "geekblue" });
    return items;
  }, [entry]);

  const content = normalizeContentParts(entry.message?.content);

  const raw = useMemo(() => formatJson(entry), [entry]);

  return (
    <Card
      size="small"
      styles={{ body: { padding: token.paddingSM } }}
      style={{ borderRadius: token.borderRadius }}
      title={
        <Flex gap={8} align="center" wrap style={{ minWidth: 0 }}>
          {tags.map((t, idx) => (
            <Tag key={`${t.value}-${idx}`} color={t.color}>
              {t.value}
            </Tag>
          ))}
          {entry.timestamp ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {entry.timestamp}
            </Text>
          ) : null}
          {(entry.session_id ?? entry.sessionId) ? (
            <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
              {entry.session_id ?? entry.sessionId}
            </Text>
          ) : null}
        </Flex>
      }
    >
      <Flex vertical gap={token.marginSM}>
        {titleText ? (
          <Text strong ellipsis>
            {titleText}
          </Text>
        ) : null}

        {entry.cwd ? (
          <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
            {entry.cwd}
          </Text>
        ) : null}

        {content.length ? (
          <Flex vertical gap={token.marginXS}>
            {content.map((part, idx) =>
              renderPart(part, `${entry.type}-${idx}`),
            )}
          </Flex>
        ) : entry.type === "result" && entry.subtype === "error" ? (
          <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
            {formatJson(entry.error ?? entry)}
          </pre>
        ) : (
          <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
            {raw}
          </pre>
        )}

        <Collapse
          size="small"
          items={[
            {
              key: "raw",
              label: "Raw",
              children: (
                <pre
                  style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}
                >
                  {raw}
                </pre>
              ),
            },
          ]}
        />
      </Flex>
    </Card>
  );
};
