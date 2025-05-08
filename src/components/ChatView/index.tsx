import React, { useEffect, useRef } from "react";
import { Layout, Empty, Typography, Spin, Button, Tooltip } from "antd";
import { useChat } from "../../contexts/ChatContext";
import SystemMessage from "../SystemMessage";
import StreamingMessageItem from "../StreamingMessageItem";
import { MessageInput } from "../MessageInput";
import "./styles.css";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { CopyOutlined, SettingOutlined } from "@ant-design/icons";
import { invoke } from "@tauri-apps/api/core";
import SystemPromptModal from "../SystemPromptModal";

const { Content } = Layout;
const { Text } = Typography;

export const ChatView: React.FC = () => {
  const {
    currentChatId,
    currentMessages,
    isStreaming,
    activeChannel,
    addAssistantMessage,
  } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isPromptModalOpen, setPromptModalOpen] = React.useState(false);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [currentMessages, isStreaming]);

  if (!currentChatId) {
    return (
      <Content className="chat-view-empty">
        <Empty
          description="Select a chat or start a new one"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </Content>
    );
  }

  return (
    <Content className="chat-view">
      <div className="messages-container">
        <SystemMessage />

        {currentMessages.map((message, index) => (
          <div key={index} className={`message-container ${message.role}`}>
            <Text strong className="message-role">
              {message.role === "user" ? "You" : "Assistant"}
            </Text>
            <div className={`message-content ${message.role}`}>
              {message.role === "assistant" ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
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
                    code({ className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || "");
                      const language = match ? match[1] : "";
                      const isInline = !match && !className;
                      const codeString = String(children).replace(/\n$/, "");
                      const [copied, setCopied] = React.useState(false);
                      const handleCopy = async () => {
                        try {
                          await invoke("copy_to_clipboard", {
                            text: codeString,
                          });
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1200);
                        } catch (e) {
                          setCopied(false);
                        }
                      };
                      if (isInline) {
                        return (
                          <code className={className} {...props}>
                            {children}
                          </code>
                        );
                      }
                      return (
                        <div style={{ position: "relative" }}>
                          <Tooltip
                            title={copied ? "Copied!" : "Copy"}
                            placement="left"
                          >
                            <Button
                              icon={<CopyOutlined />}
                              size="small"
                              style={{
                                position: "absolute",
                                top: 8,
                                right: 8,
                                zIndex: 2,
                                background: "rgba(255,255,255,0.8)",
                                border: "none",
                                boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                              }}
                              onClick={handleCopy}
                            />
                          </Tooltip>
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
                            {codeString}
                          </SyntaxHighlighter>
                        </div>
                      );
                    },
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              ) : (
                message.content
              )}
            </div>
          </div>
        ))}

        {isStreaming && activeChannel && (
          <div className="message-container assistant">
            <Text strong className="message-role">
              Assistant
            </Text>
            <div className="message-content assistant streaming">
              <StreamingMessageItem
                channel={activeChannel}
                onComplete={addAssistantMessage}
              />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="input-container">
        <div style={{ display: "flex", alignItems: "center" }}>
          <Tooltip title="Customize System Prompt">
            <Button
              icon={<SettingOutlined />}
              className="system-prompt-btn"
              style={{
                marginLeft: 0,
                marginRight: 0,
                padding: 0,
                width: 32,
                height: 32,
                minWidth: 32,
                flex: "none",
              }}
              type="text"
              onClick={() => setPromptModalOpen(true)}
              aria-label="Customize System Prompt"
            />
          </Tooltip>
          <div style={{ flex: 1, minWidth: 0 }}>
            <MessageInput isStreamingInProgress={isStreaming} />
          </div>
        </div>
        {isStreaming && (
          <div className="streaming-indicator">
            <Spin size="small" />
            <span>AI is thinking...</span>
          </div>
        )}
        <SystemPromptModal
          open={isPromptModalOpen}
          onClose={() => setPromptModalOpen(false)}
        />
      </div>
    </Content>
  );
};
