import React, { memo, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Divider,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  Flex,
  theme,
} from "antd";
import {
  RobotOutlined,
  CopyOutlined,
  ExpandAltOutlined,
  CompressOutlined,
} from "@ant-design/icons";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  formatResultContent,
  shouldCollapseContent,
  createContentPreview,
  getStatusColor,
  safeStringify,
} from "../../utils/resultFormatters";
import { ExecutionStatus } from "../../types/chat";

const { Text } = Typography;

export interface ToolResultCardProps {
  content: string;
  toolName: string;
  status?: ExecutionStatus;
  timestamp?: string;
  defaultCollapsed?: boolean;
  isLoading?: boolean;
  errorMessage?: string;
}

const ToolResultCardComponent: React.FC<ToolResultCardProps> = ({
  content,
  toolName,
  status = "success",
  timestamp,
  defaultCollapsed,
  isLoading,
  errorMessage,
}) => {
  const { token } = theme.useToken();
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof defaultCollapsed === "boolean") {
      return !defaultCollapsed;
    }
    return false;
  });

  useEffect(() => {
    if (typeof defaultCollapsed === "boolean") {
      setExpanded(!defaultCollapsed);
    }
  }, [defaultCollapsed]);

  const formatted = useMemo(() => formatResultContent(content), [content]);
  const derivedIsLoading = useMemo(() => {
    if (typeof isLoading === "boolean") {
      return isLoading;
    }
    return formatted.formattedText.trim().length === 0;
  }, [formatted.formattedText, isLoading]);

  const collapseByDefault = useMemo(
    () => shouldCollapseContent(formatted.formattedText),
    [formatted.formattedText],
  );

  const isCollapsible = formatted.isJson || collapseByDefault;
  const isExpanded = !isCollapsible || expanded;

  const preview = useMemo(
    () => createContentPreview(formatted.formattedText),
    [formatted.formattedText],
  );

  const handleCopy = async () => {
    try {
      const textToCopy = formatted.isJson
        ? safeStringify(formatted.parsedJson)
        : formatted.formattedText;
      await navigator.clipboard.writeText(textToCopy);
    } catch (error) {
      console.error("[ToolResultCard] Failed to copy result:", error);
    }
  };

  return (
    <Card
      size="small"
      variant="outlined"
      style={{
        borderRadius: token.borderRadiusLG,
        borderColor: token.colorBorderSecondary,
        backgroundColor: token.colorBgContainer,
      }}
      bodyStyle={{ padding: token.paddingMD }}
    >
      <Space
        direction="vertical"
        style={{ width: "100%" }}
        size={token.marginSM}
      >
        <Flex align="center" justify="space-between">
          <Space size={token.marginXS} align="center">
            <RobotOutlined style={{ color: token.colorPrimary }} />
            <Text strong>AI Tool</Text>
            <Tag color={token.colorPrimary}>{toolName}</Tag>
            <Tag color={getStatusColor(status)}>{status}</Tag>
          </Space>

          <Space size="small">
            <Tooltip title={expanded ? "Collapse result" : "Expand result"}>
              {isCollapsible && (
                <Button
                  type="text"
                  size="small"
                  icon={expanded ? <CompressOutlined /> : <ExpandAltOutlined />}
                  onClick={() => setExpanded((prev) => !prev)}
                />
              )}
            </Tooltip>
            <Tooltip title="Copy result">
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                onClick={handleCopy}
              />
            </Tooltip>
          </Space>
        </Flex>

        {timestamp && (
          <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            {new Date(timestamp).toLocaleString()}
          </Text>
        )}

        <Divider style={{ margin: `${token.marginXS}px 0` }} />

        {errorMessage && (
          <Alert
            type="error"
            message="Tool execution failed"
            description={errorMessage}
            showIcon
            style={{ marginBottom: token.marginXS }}
          />
        )}

        <Flex vertical style={{ width: "100%", overflow: "hidden" }}>
          {derivedIsLoading ? (
            <Spin tip="Waiting for tool result..." />
          ) : formatted.isJson ? (
            <SyntaxHighlighter
              language="json"
              style={oneDark}
              wrapLongLines={true}
              customStyle={{
                margin: 0,
                borderRadius: token.borderRadiusSM,
                backgroundColor: token.colorBgContainer,
                fontSize: token.fontSizeSM,
                maxHeight: isExpanded ? "none" : 280,
                overflow: isExpanded ? "auto" : "hidden",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
              codeTagProps={{
                style: {
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                },
              }}
            >
              {formatted.formattedText}
            </SyntaxHighlighter>
          ) : (
            <pre
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontSize: token.fontSizeSM,
                maxHeight: isExpanded ? "none" : 280,
                overflow: isExpanded ? "visible" : "hidden",
                marginBottom: 0,
              }}
            >
              {isExpanded ? formatted.formattedText : preview.preview}
              {!isExpanded && preview.isTruncated && "\n…"}
            </pre>
          )}
        </Flex>
      </Space>
    </Card>
  );
};

export const ToolResultCard = memo(ToolResultCardComponent);
ToolResultCard.displayName = "ToolResultCard";

export default ToolResultCard;
