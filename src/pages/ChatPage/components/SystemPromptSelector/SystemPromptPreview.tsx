import React from "react";
import { Card, Typography } from "antd";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

const { Text, Paragraph } = Typography;

type SystemPromptPreviewProps = {
  content: string;
  token: any;
  showGradient: boolean;
  onClick: (event: React.MouseEvent) => void;
};

export const SystemPromptPreview: React.FC<SystemPromptPreviewProps> = ({
  content,
  token,
  showGradient,
  onClick,
}) => {
  return (
    <Card
      size="small"
      style={{
        marginLeft: token.marginLG,
        marginTop: token.marginXS,
        backgroundColor: token.colorBgLayout,
        borderColor: token.colorBorderSecondary,
      }}
      bodyStyle={{ padding: token.paddingMD }}
      onClick={onClick}
    >
      <div
        style={{
          maxHeight: "60vh",
          overflowY: "auto",
          position: "relative",
          paddingRight: token.paddingXS,
        }}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => (
              <Paragraph style={{ marginBottom: token.marginSM }}>
                {children}
              </Paragraph>
            ),
            ol: ({ children }) => (
              <ol
                style={{
                  marginBottom: token.marginSM,
                  paddingLeft: token.paddingLG,
                }}
              >
                {children}
              </ol>
            ),
            ul: ({ children }) => (
              <ul
                style={{
                  marginBottom: token.marginSM,
                  paddingLeft: token.paddingLG,
                }}
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
            h2: ({ children }) => (
              <Text
                strong
                style={{
                  fontSize: token.fontSizeHeading4,
                  marginBottom: token.marginSM,
                  display: "block",
                }}
              >
                {children}
              </Text>
            ),
            code: ({ inline, className, children, ...props }: any) => {
              const match = /language-(\w+)/.exec(className || "");
              if (!inline) {
                return (
                  <SyntaxHighlighter
                    style={oneDark}
                    language={match?.[1] || "text"}
                    PreTag="div"
                    wrapLongLines
                  >
                    {String(children).replace(/\n$/, "")}
                  </SyntaxHighlighter>
                );
              }

              return (
                <code
                  className={className}
                  style={{
                    backgroundColor: token.colorFillTertiary,
                    padding: "0 4px",
                    borderRadius: token.borderRadiusSM,
                    fontSize: token.fontSizeSM,
                  }}
                  {...props}
                >
                  {children}
                </code>
              );
            },
          }}
        >
          {content || "No content available."}
        </ReactMarkdown>

        {showGradient ? (
          <div
            style={{
              position: "sticky",
              bottom: 0,
              height: 48,
              background: `linear-gradient(180deg, transparent, ${token.colorBgLayout})`,
              pointerEvents: "none",
              marginTop: -48,
            }}
          />
        ) : null}
      </div>
    </Card>
  );
};
