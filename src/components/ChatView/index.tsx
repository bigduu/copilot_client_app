import React, { useEffect, useRef } from "react";
import { Typography, Card, Empty } from "antd";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useChat } from "../../contexts/ChatContext";
import { Message } from "../../types/chat";
import StreamingMessageItem from "../StreamingMessageItem";
import SystemMessage from "../SystemMessage";
import "./styles.css";

const { Text } = Typography;

interface MessageContentProps {
  message: Message;
}

const MessageContent: React.FC<MessageContentProps> = ({ message }) => {
  // Use ReactMarkdown for both user and assistant messages
  return (
    <ReactMarkdown
      children={message.content}
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="markdown-paragraph" style={{ whiteSpace: "pre-line" }}>
            {children}
          </p>
        ),
        ol: ({ children }) => <ol className="markdown-list">{children}</ol>,
        ul: ({ children }) => <ul className="markdown-list">{children}</ul>,
        li: ({ children }) => (
          <li className="markdown-list-item">{children}</li>
        ),
        br: () => <br />,
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          const language = match ? match[1] : "";
          const isInline = !match && !className;

          if (isInline) {
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          }

          return (
            <SyntaxHighlighter
              style={oneDark}
              language={language || "text"}
              PreTag="div"
              customStyle={{
                margin: "0.5em 0",
                borderRadius: "6px",
                fontSize: "14px",
              }}
            >
              {String(children).replace(/\n$/, "")}
            </SyntaxHighlighter>
          );
        },
      }}
    />
  );
};

export const ChatView: React.FC = () => {
  const {
    currentMessages,
    isStreaming,
    activeChannel,
    addAssistantMessage,
    currentChatId,
    chats,
  } = useChat();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Filter out system messages for display
  const displayMessages = currentMessages.filter(
    (message) => message.role === "user" || message.role === "assistant"
  );

  // Add debugging logs
  useEffect(() => {
    console.log("ChatView state:", {
      isStreaming,
      hasActiveChannel: !!activeChannel,
      messagesCount: displayMessages.length,
      currentChatId,
      hasChats: chats.length > 0,
    });
  }, [
    isStreaming,
    activeChannel,
    displayMessages.length,
    currentChatId,
    chats,
  ]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Scroll whenever messages or streaming state updates
  useEffect(() => {
    scrollToBottom();
  }, [displayMessages, isStreaming]);

  // If there are no chats at all
  if (chats.length === 0) {
    return (
      <div className="chat-view">
        <SystemMessage />
        <Empty description="No messages yet" className="empty-message" />
      </div>
    );
  }

  // If the current chat has no messages
  if (displayMessages.length === 0 && !isStreaming) {
    return (
      <div className="chat-view">
        <SystemMessage />
        <Empty description="Start chatting!" className="empty-message" />
      </div>
    );
  }

  return (
    <div className="chat-view">
      <SystemMessage />
      {/* Render completed messages */}
      {displayMessages.map((message, index) => (
        <div
          key={`${message.role}-${index}`}
          className={`message-container ${message.role}`}
        >
          <Text strong>{message.role === "user" ? "You" : "Assistant"}</Text>
          <Card size="small" className={`message-card ${message.role}`}>
            <MessageContent message={message} />
          </Card>
        </div>
      ))}

      {/* Render the streaming message component if we're streaming */}
      {isStreaming && activeChannel && currentChatId && (
        <StreamingMessageItem
          channel={activeChannel}
          onComplete={addAssistantMessage}
        />
      )}

      {/* Element to scroll to */}
      <div ref={messagesEndRef} />
    </div>
  );
};
