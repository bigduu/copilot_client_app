import React from "react";
import { Card, Space, Typography, Button, Tooltip, theme } from "antd";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { CopyOutlined } from "@ant-design/icons";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

const { Text } = Typography;
const { useToken } = theme;

interface MessageCardProps {
  role: string;
  content: string;
  children?: React.ReactNode;
}

const MessageCard: React.FC<MessageCardProps> = ({
  role,
  content,
  children,
}) => {
  const { token } = useToken();
  return (
    <Card
      style={{
        maxWidth: "85%",
        background:
          role === "user"
            ? token.colorPrimaryBg
            : role === "assistant"
            ? token.colorBgLayout
            : token.colorBgContainer,
        borderRadius: token.borderRadiusLG,
        boxShadow: token.boxShadow,
        position: "relative",
      }}
    >
      <Space
        direction="vertical"
        size={token.marginXS}
        style={{ width: "100%" }}
      >
        <Text type="secondary" strong style={{ fontSize: token.fontSizeSM }}>
          {role === "user" ? "You" : role === "assistant" ? "Assistant" : role}
        </Text>
        <div>
          <ReactMarkdown
            remarkPlugins={
              role === "user" ? [remarkGfm, remarkBreaks] : [remarkGfm]
            }
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
              code({ className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || "");
                const language = match ? match[1] : "";
                const isInline = !match && !className;
                const codeString = String(children).replace(/\n$/, "");

                if (isInline) {
                  return (
                    <Text code className={className} {...props}>
                      {children}
                    </Text>
                  );
                }

                return (
                  <div style={{ position: "relative" }}>
                    <SyntaxHighlighter
                      style={oneDark}
                      language={language || "text"}
                      PreTag="div"
                      customStyle={{
                        margin: `${token.marginXS}px 0`,
                        borderRadius: token.borderRadiusSM,
                        fontSize: token.fontSizeSM,
                      }}
                    >
                      {codeString}
                    </SyntaxHighlighter>
                  </div>
                );
              },
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
        {children}
      </Space>
    </Card>
  );
};

export default MessageCard;
