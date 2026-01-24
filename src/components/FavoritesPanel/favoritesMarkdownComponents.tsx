import React from "react";
import { Card, Typography } from "antd";
import type { Components } from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

const { Text } = Typography;

export const createFavoritesMarkdownComponents = (token: any): Components => ({
  p: ({ children }) => (
    <Text
      style={{
        marginBottom: token.marginSM,
        display: "block",
      }}
    >
      {children}
    </Text>
  ),
  ol: ({ children }) => (
    <ol
      style={{
        marginBottom: token.marginSM,
        paddingLeft: 20,
      }}
    >
      {children}
    </ol>
  ),
  ul: ({ children }) => (
    <ul
      style={{
        marginBottom: token.marginSM,
        paddingLeft: 20,
      }}
    >
      {children}
    </ul>
  ),
  li: ({ children }) => (
    <li style={{ marginBottom: token.marginXS }}>{children}</li>
  ),
  blockquote: ({ children }) => (
    <Card
      size="small"
      style={{
        borderLeft: `3px solid ${token.colorPrimary}`,
        background: token.colorPrimaryBg,
        margin: `${token.marginXS}px 0`,
      }}
    >
      <Text type="secondary" italic>
        {children}
      </Text>
    </Card>
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
      <Card
        size="small"
        styles={{ body: { padding: 0 } }}
        style={{ overflowX: "auto" }}
      >
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
      </Card>
    );
  },
});
