import React from "react";
import { Card, Space, Typography, theme } from "antd";
import ReactMarkdown from "react-markdown";
import { useChat } from "../../contexts/ChatContext";

const { Text } = Typography;
const { useToken } = theme;

// Default message to use as fallback
const DEFAULT_MESSAGE = `# Hello! I'm your AI Assistant 👋

I'm here to help you with:

* Writing and reviewing code
* Answering questions
* Solving problems
* Explaining concepts
* And much more!

I'll respond using markdown formatting to make information clear and well-structured. Feel free to ask me anything!

---
Let's get started - what can I help you with today?`;

const SystemMessage: React.FC = () => {
  console.log("SystemMessage component rendering");
  const { token } = useToken();

  // Get the system prompt from the current chat context
  const { currentChat, systemPrompt } = useChat();

  // Use the current chat's system prompt if available, otherwise fall back to global
  const promptToDisplay =
    (currentChat?.systemPrompt || systemPrompt || DEFAULT_MESSAGE).trim() ||
    DEFAULT_MESSAGE;

  return (
    <Card
      style={{
        position: "relative",
        width: "100%",
        maxHeight: "30vh",
        overflowY: "auto",
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

        <div style={{ display: "flex", gap: token.marginSM }}>
          <div style={{ flex: 1 }}>
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
                  <ol style={{ marginBottom: token.marginSM, paddingLeft: 20 }}>
                    {children}
                  </ol>
                ),
                ul: ({ children }) => (
                  <ul style={{ marginBottom: token.marginSM, paddingLeft: 20 }}>
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
          </div>
        </div>
      </Space>
    </Card>
  );
};

export default SystemMessage;
