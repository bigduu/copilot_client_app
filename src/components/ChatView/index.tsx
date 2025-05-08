import React, { useEffect, useRef } from "react";
import {
  Layout,
  Empty,
  Typography,
  List,
  Card,
  Space,
  theme,
  Button,
  Tooltip,
} from "antd";
import { useChat } from "../../contexts/ChatContext";
import SystemMessage from "../SystemMessage";
import StreamingMessageItem from "../StreamingMessageItem";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { CopyOutlined } from "@ant-design/icons";
import { invoke } from "@tauri-apps/api/core";
import { InputContainer } from "../InputContainer";
import "./ChatView.css"; // Import a new CSS file for animations and specific styles

const { Content } = Layout;
const { Text } = Typography;
const { useToken } = theme;

export const ChatView: React.FC = () => {
  const {
    currentChatId,
    currentMessages,
    isStreaming,
    activeChannel,
    addAssistantMessage,
  } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { token } = useToken();

  useEffect(() => {
    if (messagesEndRef.current && currentMessages.length > 0) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [currentMessages, isStreaming]);

  const hasMessages = currentMessages.length > 0;
  const showMessagesView =
    currentChatId && (hasMessages || (isStreaming && activeChannel));

  return (
    <Layout
      style={{
        height: "100vh",
        background: token.colorBgContainer,
        position: "relative", // For positioning animated elements
        overflow: "hidden", // Prevent scrollbars from animated elements moving out
      }}
    >
      {/* System Message Area - transitions between top-of-messages and centered view */}
      <div
        className={`chat-view-system-message-container ${
          showMessagesView ? "messages-view" : "centered-view"
        }`}
        style={{
          paddingTop: showMessagesView ? token.padding : token.paddingXL,
          paddingLeft: showMessagesView
            ? token.padding
            : token.paddingContentHorizontal,
          paddingRight: showMessagesView
            ? token.padding
            : token.paddingContentHorizontal,
          paddingBottom: showMessagesView ? 0 : token.marginXL,
        }}
      >
        {currentChatId ? (
          <>
            <SystemMessage isExpandedView={!showMessagesView} />
            {!showMessagesView && !hasMessages && (
              <Empty
                description="Send a message to start the conversation."
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                style={{ marginTop: token.marginMD, textAlign: "center" }}
              />
            )}
          </>
        ) : (
          !showMessagesView && ( // Only show "Select a chat" if no chat is selected AND in centered view
            <Empty
              description="Select a chat or start a new one"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              style={{ textAlign: "center" }}
            />
          )
        )}
      </div>

      {/* Messages List Area - only truly visible and scrollable in messages view */}
      <Content
        className={`chat-view-messages-list ${
          showMessagesView ? "visible" : "hidden"
        }`}
        style={{
          flex: 1,
          padding: token.padding,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: token.marginMD,
          opacity: showMessagesView ? 1 : 0,
        }}
      >
        {showMessagesView &&
          currentMessages.map((message, index) => (
            <List.Item
              key={index}
              style={{
                padding: token.paddingXS,
                border: "none",
                display: "flex",
                justifyContent:
                  message.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              <Card
                style={{
                  maxWidth: "85%",
                  background:
                    message.role === "user"
                      ? token.colorPrimaryBg
                      : token.colorBgLayout, // Changed for better contrast from main bg
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
                  <Text
                    type="secondary"
                    strong
                    style={{ fontSize: token.fontSizeSM }}
                  >
                    {message.role === "user" ? "You" : "Assistant"}
                  </Text>
                  <div>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkBreaks]}
                      components={{
                        br: () => <br />,
                        p: ({ children }) => (
                          <Text style={{ marginBottom: token.marginSM }}>
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
                          <li style={{ marginBottom: token.marginXS }}>
                            {children}
                          </li>
                        ),
                        code({ className, children, ...props }) {
                          const match = /language-(\\w+)/.exec(className || "");
                          const language = match ? match[1] : "";
                          const isInline = !match && !className;
                          const codeString = String(children).replace(
                            /\\n$/,
                            ""
                          );
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
                              <Text code className={className} {...props}>
                                {children}
                              </Text>
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
                                  type="text"
                                  style={{
                                    position: "absolute",
                                    top: token.marginXS,
                                    right: token.marginXS,
                                    zIndex: 2,
                                    background: token.colorBgContainer,
                                    borderRadius: token.borderRadiusSM,
                                  }}
                                  onClick={handleCopy}
                                />
                              </Tooltip>
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
                      {message.content}
                    </ReactMarkdown>
                  </div>
                  {message.role === "assistant" && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: token.paddingXS,
                        right: token.paddingXS,
                        zIndex: 1,
                      }}
                    >
                      <Tooltip title={"Copy message"} placement="topRight">
                        <Button
                          icon={<CopyOutlined />}
                          size="small"
                          type="text"
                          onClick={async () => {
                            try {
                              await invoke("copy_to_clipboard", {
                                text: message.content,
                              });
                            } catch (e) {
                              console.error("Failed to copy message:", e);
                            }
                          }}
                          style={{
                            background: token.colorBgElevated,
                            borderRadius: token.borderRadiusSM,
                          }}
                        />
                      </Tooltip>
                    </div>
                  )}
                </Space>
              </Card>
            </List.Item>
          ))}

        {/* AI 流式消息 - only shown when messagesView is active */}
        {showMessagesView && isStreaming && activeChannel && (
          <List.Item
            style={{
              padding: token.paddingXS,
              border: "none",
              display: "flex",
              justifyContent: "flex-start",
            }}
          >
            <Card
              bordered={false}
              style={{
                maxWidth: "85%",
                background: token.colorBgLayout, // Changed for better contrast
                borderRadius: token.borderRadiusLG,
                boxShadow: token.boxShadow,
              }}
              bodyStyle={{
                padding: token.paddingMD,
              }}
            >
              <Space
                direction="vertical"
                size={token.marginXS}
                style={{ width: "100%" }}
              >
                <Text
                  type="secondary"
                  strong
                  style={{ fontSize: token.fontSizeSM }}
                >
                  Assistant
                </Text>
                <div>
                  <StreamingMessageItem
                    channel={activeChannel}
                    onComplete={addAssistantMessage}
                  />
                </div>
              </Space>
            </Card>
          </List.Item>
        )}
        <div ref={messagesEndRef} />
      </Content>

      {/* Input Container Area - transitions between bottom and centered view */}
      <div
        className={`chat-view-input-container-wrapper ${
          showMessagesView ? "messages-view" : "centered-view"
        }`}
      >
        <div style={{ width: "100%", maxWidth: "768px", margin: "0 auto" }}>
          <InputContainer
            isStreaming={isStreaming}
            isCenteredLayout={!showMessagesView}
          />
        </div>
      </div>
    </Layout>
  );
};
