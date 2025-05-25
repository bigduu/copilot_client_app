import React from "react";
import { Typography, theme } from "antd";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

const { Text } = Typography;
const { useToken } = theme;

interface MarkdownRendererProps {
  content: string;
  role?: string;
  enableBreaks?: boolean;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  role = "assistant",
  enableBreaks = false,
}) => {
  const { token } = useToken();

  const markdownComponents = {
    p: ({ children }: any) => (
      <Text
        style={{
          marginBottom: token.marginSM,
          display: "block",
        }}
      >
        {children}
      </Text>
    ),
    ol: ({ children }: any) => (
      <ol
        style={{
          marginBottom: token.marginSM,
          paddingLeft: 20,
        }}
      >
        {children}
      </ol>
    ),
    ul: ({ children }: any) => (
      <ul
        style={{
          marginBottom: token.marginSM,
          paddingLeft: 20,
        }}
      >
        {children}
      </ul>
    ),
    li: ({ children }: any) => (
      <li
        style={{
          marginBottom: token.marginXS,
        }}
      >
        {children}
      </li>
    ),
    code({ node, inline, className, children, ...props }: any) {
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
        <div
          style={{
            position: "relative",
            maxWidth: "100%",
            overflow: "auto",
          }}
        >
          <SyntaxHighlighter
            style={oneDark}
            language={language || "text"}
            PreTag="div"
            customStyle={{
              margin: `${token.marginXS}px 0`,
              borderRadius: token.borderRadiusSM,
              fontSize: token.fontSizeSM,
              maxWidth: "100%",
            }}
          >
            {codeString}
          </SyntaxHighlighter>
        </div>
      );
    },
    blockquote: ({ children }: any) => (
      <div
        style={{
          borderLeft: `3px solid ${token.colorPrimary}`,
          background: token.colorPrimaryBg,
          padding: `${token.paddingXS}px ${token.padding}px`,
          margin: `${token.marginXS}px 0`,
          color: token.colorTextSecondary,
          fontStyle: "italic",
        }}
      >
        {children}
      </div>
    ),
    a: ({ children }: any) => (
      <Text style={{ color: token.colorLink }}>{children}</Text>
    ),
  };

  return (
    <div style={{ width: "100%", maxWidth: "100%" }}>
      <ReactMarkdown
        remarkPlugins={
          role === "user" && enableBreaks
            ? [remarkGfm, remarkBreaks]
            : [remarkGfm]
        }
        components={markdownComponents}
      >
        {content || " "}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
