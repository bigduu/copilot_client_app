import React from "react";
import { Card, Typography } from "antd";
import ReactMarkdown from "react-markdown";
import { Message } from "../../types/chat";
import "./MessageItem.css";

const { Text } = Typography;

interface MessageItemProps {
  message: Message;
}

interface CodeComponentProps {
  children?: React.ReactNode;
  className?: string;
  inline?: boolean;
}

export const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  const isUser = message.role === "user";

  return (
    <div className={`message-item ${isUser ? "user" : "assistant"}`}>
      <Text strong className="role-label">
        {isUser ? "You" : "Assistant"}
      </Text>
      <Card size="small" className="message-content">
        {isUser ? (
          <div className="text-content">{message.content}</div>
        ) : (
          <ReactMarkdown
            components={{
              p: ({ children }) => (
                <p className="markdown-paragraph">{children}</p>
              ),
              ol: ({ children }) => (
                <ol className="markdown-list">{children}</ol>
              ),
              ul: ({ children }) => (
                <ul className="markdown-list">{children}</ul>
              ),
              li: ({ children }) => (
                <li className="markdown-list-item">{children}</li>
              ),
              code: ({ inline, className, children }: CodeComponentProps) => {
                const isInline = inline || !className?.includes("language-");
                return (
                  <code
                    className={
                      isInline ? "markdown-inline-code" : "markdown-block-code"
                    }
                  >
                    {children}
                  </code>
                );
              },
              pre: ({ children }) => (
                <pre className="markdown-pre">{children}</pre>
              ),
            }}
          >
            {message.content || "..."}
          </ReactMarkdown>
        )}
      </Card>
    </div>
  );
};
