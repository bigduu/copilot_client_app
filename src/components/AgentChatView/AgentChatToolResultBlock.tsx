import React from "react";
import { Card, Collapse, Flex, Tag, Typography } from "antd";

import type { ClaudeContentPart } from "../ClaudeStream";
import { formatJson, tryParseJson } from "./agentChatFormatters";
import { normalizeToolName } from "./agentChatToolUtils";
import {
  getToolResultText,
  parseDirectoryTree,
  parseEditResult,
  parseMultiEditResult,
  parseNumberedCode,
} from "./agentChatToolResultUtils";
import { NumberedCodeBlock, renderTreeNodes } from "./AgentChatToolResultViews";

const { Text } = Typography;

const ToolResultDetails: React.FC<{
  toolUse?: Extract<ClaudeContentPart, { type: "tool_use" }>;
  part: any;
}> = ({ toolUse, part }) => {
  const tool = normalizeToolName(toolUse?.name);
  const content = part?.content;
  const text = getToolResultText(content);
  const parsedJson = typeof text === "string" ? tryParseJson(text) : null;

  if (!tool) {
    return null;
  }

  if (tool === "ls") {
    const nodes = parseDirectoryTree(text);
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
    );
  }

  if (tool === "read") {
    const path =
      toolUse?.input?.path ?? toolUse?.input?.file_path ?? toolUse?.input?.file;
    const parsed = parseNumberedCode(text);
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
    );
  }

  if (tool === "edit") {
    const path =
      toolUse?.input?.path ?? toolUse?.input?.file_path ?? toolUse?.input?.file;
    const parsed = parseEditResult(text);
    if (parsed) {
      return (
        <NumberedCodeBlock
          code={parsed.code}
          startLine={parsed.startLine}
          header={
            <Flex gap={8} align="center" wrap>
              <Text strong>Edit Result</Text>
              {parsed.filePath ? <Text code>{parsed.filePath}</Text> : null}
              {!parsed.filePath && path ? (
                <Text code>{String(path)}</Text>
              ) : null}
            </Flex>
          }
        />
      );
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
    );
  }

  if (tool === "multiedit") {
    const sections = parseMultiEditResult(text);
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
                  {section.filePath ? (
                    <Text code>{section.filePath}</Text>
                  ) : null}
                </Flex>
              }
            />
          ))}
        </Flex>
      );
    }
    return (
      <Card size="small" styles={{ body: { padding: 10 } }}>
        <Text strong>Multi-Edit Result</Text>
        <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
          {text}
        </pre>
      </Card>
    );
  }

  if (tool === "write") {
    const path =
      toolUse?.input?.path ?? toolUse?.input?.file_path ?? toolUse?.input?.file;
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
    );
  }

  if (tool === "bash") {
    return (
      <Card size="small" styles={{ body: { padding: 10 } }}>
        <Text strong>Command Output</Text>
        <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
          {text}
        </pre>
      </Card>
    );
  }

  if (tool === "websearch") {
    return (
      <Card size="small" styles={{ body: { padding: 10 } }}>
        <Text strong>Search Results</Text>
        <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
          {text}
        </pre>
      </Card>
    );
  }

  if (tool === "webfetch") {
    return (
      <Card size="small" styles={{ body: { padding: 10 } }}>
        <Text strong>Fetched Content</Text>
        <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
          {text}
        </pre>
      </Card>
    );
  }

  if (parsedJson) {
    return (
      <Card size="small" styles={{ body: { padding: 10 } }}>
        <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
          {formatJson(parsedJson)}
        </pre>
      </Card>
    );
  }

  return null;
};

export const AgentChatToolResultBlock: React.FC<{
  part: any;
  toolUse?: Extract<ClaudeContentPart, { type: "tool_use" }>;
}> = ({ part, toolUse }) => {
  const isError = Boolean(part?.is_error);
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
                <pre
                  style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}
                >
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
  );
};
