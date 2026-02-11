import React, { memo, useMemo } from "react";
import { Collapse, Space, Button, Typography, theme, Tooltip } from "antd";
import { ToolOutlined, CopyOutlined } from "@ant-design/icons";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { safeStringify } from "../../utils/resultFormatters";

const { Text } = Typography;

export interface ToolCallCardProps {
  toolName: string;
  parameters: Record<string, any>;
  toolCallId: string;
  defaultExpanded?: boolean;
}

/**
 * Generate a human-readable intent description from tool name and parameters
 */
function generateIntentDescription(
  toolName: string,
  params: Record<string, any>,
): string {
  const truncate = (value: unknown, maxLen: number) => {
    const str = typeof value === "string" ? value : String(value ?? "");
    if (!str || str.length <= maxLen) return str;
    return str.substring(0, maxLen).trimEnd() + "…";
  };

  const nameMap: Record<string, (p: typeof params) => string> = {
    file_read: (p) =>
      `Reading: ${truncate(p.path || p.file_path || "unknown", 40)}`,
    file_write: (p) =>
      `Writing to: ${truncate(p.path || p.file_path || "unknown", 35)}`,
    file_edit: (p) =>
      `Editing: ${truncate(p.path || p.file_path || "unknown", 40)}`,
    bash: (p) => `Executing: ${truncate(p.command, 40)}`,
    grep: (p) => `Searching: "${truncate(p.pattern, 30)}"`,
    glob: (p) => `Finding files: "${p.pattern}"`,
    read: (p) => `Reading: ${p.file_path || "file"}`,
    write: (p) => `Writing: ${p.file_path || "file"}`,
    edit: (p) => `Editing: ${p.file_path || "file"}`,
    search: (p) => `Searching: "${truncate(p.query || p.pattern, 30)}"`,
    default: () => `Calling ${toolName}`,
  };

  const generator = nameMap[toolName] || nameMap["default"];
  return generator(params);
}

const ToolCallCardComponent: React.FC<ToolCallCardProps> = ({
  toolName,
  parameters,
  toolCallId,
  defaultExpanded = false,
}) => {
  const { token } = theme.useToken();

  const intentDescription = useMemo(
    () => generateIntentDescription(toolName, parameters),
    [toolName, parameters],
  );

  const formattedJson = useMemo(
    () => safeStringify(parameters, 2),
    [parameters],
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formattedJson);
    } catch (error) {
      console.error("[ToolCallCard] Failed to copy parameters:", error);
    }
  };

  // Get first 2-3 key params for bullet list in expanded view
  const keyParamsList = useMemo(() => {
    const priorityKeys = [
      "path",
      "file_path",
      "command",
      "pattern",
      "query",
      "limit",
    ];
    const entries = Object.entries(parameters);
    const sortedEntries = entries.sort((a, b) => {
      const aIndex = priorityKeys.indexOf(a[0]);
      const bIndex = priorityKeys.indexOf(b[0]);
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return 0;
    });
    return sortedEntries.slice(0, 3);
  }, [parameters]);

  return (
    <Collapse
      defaultActiveKey={defaultExpanded ? [toolCallId] : []}
      style={{
        backgroundColor: token.colorInfoBg,
        borderColor: token.colorInfoBorder,
        borderWidth: 1,
        borderStyle: "solid",
        borderRadius: token.borderRadiusLG,
      }}
      items={[
        {
          key: toolCallId,
          label: (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: token.marginSM,
                width: "100%",
              }}
            >
              <ToolOutlined
                style={{ color: token.colorPrimary, flexShrink: 0 }}
              />
              <Text strong style={{ color: token.colorText, flexShrink: 0 }}>
                {toolName}
              </Text>
              <Text
                type="secondary"
                ellipsis
                style={{ flex: 1, minWidth: 0, fontSize: token.fontSizeSM }}
              >
                {intentDescription}
              </Text>
            </div>
          ),
          children: (
            <Space
              direction="vertical"
              style={{ width: "100%" }}
              size={token.marginSM}
            >
              {/* Key Parameters Section */}
              {keyParamsList.length > 0 && (
                <div>
                  <Text
                    strong
                    style={{
                      fontSize: token.fontSizeSM,
                      marginBottom: token.marginXS,
                      display: "block",
                    }}
                  >
                    Key parameters:
                  </Text>
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: token.paddingLG,
                      fontSize: token.fontSizeSM,
                    }}
                  >
                    {keyParamsList.map(([key, value]) => (
                      <li key={key}>
                        <Text code style={{ fontSize: token.fontSizeSM }}>
                          {key}
                        </Text>
                        <Text style={{ fontSize: token.fontSizeSM }}>
                          :{" "}
                          {typeof value === "string"
                            ? value
                            : JSON.stringify(value)}
                        </Text>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Full Parameters Section */}
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: token.marginXS,
                  }}
                >
                  <Text strong style={{ fontSize: token.fontSizeSM }}>
                    Full parameters:
                  </Text>
                  <Tooltip title="Copy parameters">
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyOutlined />}
                      aria-label="Copy parameters"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopy();
                      }}
                    />
                  </Tooltip>
                </div>
                <SyntaxHighlighter
                  language="json"
                  style={oneDark}
                  wrapLongLines={true}
                  customStyle={{
                    margin: 0,
                    borderRadius: token.borderRadiusSM,
                    backgroundColor: token.colorBgContainer,
                    fontSize: token.fontSizeSM,
                    maxHeight: 400,
                    overflow: "auto",
                  }}
                  codeTagProps={{
                    style: {
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    },
                  }}
                >
                  {formattedJson}
                </SyntaxHighlighter>
              </div>
            </Space>
          ),
        },
      ]}
    />
  );
};

export const ToolCallCard = memo(ToolCallCardComponent);
ToolCallCard.displayName = "ToolCallCard";

export default ToolCallCard;
