import React from "react";
import { Typography } from "antd";
import ReactMarkdown from "react-markdown";

const { Text, Paragraph } = Typography;

type SystemPromptMarkdownProps = {
  content: string;
  token: any;
  headingColor?: string;
};

export const SystemPromptMarkdown: React.FC<SystemPromptMarkdownProps> = ({
  content,
  token,
  headingColor,
}) => {
  return (
    <ReactMarkdown
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
        h1: ({ children }) => (
          <Text
            strong
            style={{
              fontSize: token.fontSizeHeading3,
              marginBottom: token.marginSM,
              display: "block",
              color: headingColor,
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
              color: headingColor,
            }}
          >
            {children}
          </Text>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
};
