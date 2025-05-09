import React, { useState, useEffect } from "react";
import { Card, Space, Typography, theme } from "antd";
import ReactMarkdown from "react-markdown";
import { useChat } from "../../contexts/ChatContext";
import { DEFAULT_MESSAGE } from "../../constants";
import { ArrowsAltOutlined } from "@ant-design/icons";

const { Text } = Typography;
const { useToken } = theme;

// Default message to use as fallback

interface SystemMessageProps {
  isExpandedView?: boolean;
  expanded?: boolean;
  onExpandChange?: (expanded: boolean) => void;
}

const SystemMessage: React.FC<SystemMessageProps> = ({
  isExpandedView = false,
  expanded: controlledExpanded,
  onExpandChange,
}) => {
  console.log("SystemMessage component rendering");
  const { token } = useToken();

  // Get the system prompt from the current chat context
  const { currentChat, systemPrompt } = useChat();

  // Use the current chat's system prompt if available, otherwise fall back to global
  const promptToDisplay =
    (currentChat?.systemPrompt || systemPrompt || DEFAULT_MESSAGE).trim() ||
    DEFAULT_MESSAGE;

  // Local state for expand/collapse
  const [uncontrolledExpanded, setUncontrolledExpanded] =
    useState(isExpandedView);
  const expanded =
    controlledExpanded !== undefined
      ? controlledExpanded
      : uncontrolledExpanded;

  // Get summary (first line or truncated)
  const summary =
    promptToDisplay.split("\n")[0].slice(0, 80) +
    (promptToDisplay.length > 80 ? "..." : "");

  return (
    <Card
      style={{
        position: "relative",
        width: "100%",
        maxHeight: expanded ? "80vh" : "8vh",
        overflowY: expanded ? "auto" : "hidden",
        borderRadius: token.borderRadiusLG,
        boxShadow: token.boxShadow,
      }}
    >
      <Space
        direction="vertical"
        size={token.marginXS}
        style={{ width: "100%" }}
      >
        <Text type="secondary" strong style={{ fontSize: token.fontSizeSM }}>
          System Prompt
        </Text>
        <div
          style={{
            display: "flex",
            gap: token.marginSM,
            alignItems: "flex-start",
          }}
        >
          <div style={{ flex: 1 }}>
            {expanded ? (
              <ReactMarkdown
                components={{
                  p: ({ children }) => (
                    <Text
                      style={{ marginBottom: token.marginSM, display: "block" }}
                    >
                      {children}
                    </Text>
                  ),
                  ol: ({ children }) => (
                    <ol
                      style={{ marginBottom: token.marginSM, paddingLeft: 20 }}
                    >
                      {children}
                    </ol>
                  ),
                  ul: ({ children }) => (
                    <ul
                      style={{ marginBottom: token.marginSM, paddingLeft: 20 }}
                    >
                      {children}
                    </ul>
                  ),
                  li: ({ children }) => (
                    <li style={{ marginBottom: token.marginXS }}>{children}</li>
                  ),
                  h1: ({ children }) => (
                    <Text
                      strong
                      style={{
                        fontSize: token.fontSizeHeading3,
                        marginBottom: token.marginSM,
                        display: "block",
                      }}
                    >
                      {children}
                    </Text>
                  ),
                }}
              >
                {promptToDisplay}
              </ReactMarkdown>
            ) : (
              <Text style={{ color: token.colorTextSecondary }}>{summary}</Text>
            )}
          </div>
          <button
            style={{
              minWidth: 32,
              height: 32,
              border: "none",
              background: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginLeft: token.marginXS,
              transition: "transform 0.2s",
              transform: expanded ? "rotate(45deg)" : "none",
            }}
            onClick={() => {
              if (onExpandChange) {
                onExpandChange(!expanded);
              } else {
                setUncontrolledExpanded((prev) => !prev);
              }
            }}
            aria-label={expanded ? "Collapse" : "Expand"}
            title={expanded ? "Collapse" : "Expand"}
          >
            <ArrowsAltOutlined style={{ fontSize: 20 }} />
          </button>
        </div>
      </Space>
    </Card>
  );
};

export default SystemMessage;
