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
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { CopyOutlined } from "@ant-design/icons";
import { invoke } from "@tauri-apps/api/core";
import { InputContainer } from "../InputContainer";

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
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [currentMessages, isStreaming]);

  if (!currentChatId) {
    return (
      <Content
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          background: token.colorBgContainer,
        }}
      >
        <Empty
          description="Select a chat or start a new one"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </Content>
    );
  }

  return (
    <Layout
      style={{
        height: "100vh",
        background: token.colorBgContainer,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Content
        style={{
          flex: 1,
          padding: token.padding,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: token.marginMD,
        }}
      >
        {/* 系统消息 */}
        <SystemMessage />

        {/* 聊天消息流 */}
        <List
          style={{ flex: 1 }}
          split={false}
          dataSource={currentMessages}
          renderItem={(message) => (
            <List.Item
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
                      : token.colorBgContainer,
                  borderRadius: token.borderRadiusLG,
                  boxShadow: token.boxShadow,
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
                    {message.role === "assistant" ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
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
                            const match = /language-(\w+)/.exec(
                              className || ""
                            );
                            const language = match ? match[1] : "";
                            const isInline = !match && !className;
                            const codeString = String(children).replace(
                              /\n$/,
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
                    ) : (
                      <Text>{message.content}</Text>
                    )}
                  </div>
                </Space>
              </Card>
            </List.Item>
          )}
        />

        {/* AI 流式消息 */}
        {isStreaming && activeChannel && (
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
                background: token.colorBgContainer,
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

      {/* 输入区 */}
      <InputContainer isStreaming={isStreaming} />
    </Layout>
  );
};
