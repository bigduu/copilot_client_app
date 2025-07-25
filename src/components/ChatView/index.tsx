import React, { useEffect, useRef, useState } from "react";
import {
  Layout,
  Empty,
  Typography,
  Card,
  Space,
  theme,
  Button,
  Grid,
  Flex,
} from "antd";
import { useChats } from "../../hooks/useChats";
import { useMessages } from "../../hooks/useMessages";
import SystemMessage from "../SystemMessage";
import StreamingMessageItem from "../StreamingMessageItem";
import { DownOutlined } from "@ant-design/icons";
import { InputContainer } from "../InputContainer";
import "./styles.css"; // Import a new CSS file for animations and specific styles
import MessageCard from "../MessageCard";

const { Content } = Layout;
const { Text } = Typography;
const { useToken } = theme;
const { useBreakpoint } = Grid;

export const ChatView: React.FC = () => {
  // 使用新的 Zustand hooks
  const { currentChatId, currentMessages, updateChat } = useChats();
  const { isProcessing, deleteMessage } = useMessages();

  // 暂时设置这些值，因为原组件依赖它们
  const isStreaming = isProcessing;
  const activeChannel = null;
  const addAssistantMessage = () => {}; // 这个功能现在在 Store 中处理

  // Handle message deletion
  const handleDeleteMessage = (messageId: string) => {
    if (currentChatId) {
      deleteMessage(currentChatId, messageId);
    }
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesListRef = useRef<HTMLDivElement>(null);
  const { token } = useToken();
  const screens = useBreakpoint();

  // SystemMessage expand/collapse state
  const [systemMsgExpanded, setSystemMsgExpanded] = useState(true);
  // Track last chatId to detect chat change
  const lastChatIdRef = useRef<string | null>(null);
  // Scroll-to-bottom button state
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  // Responsive container width calculation
  const getContainerMaxWidth = () => {
    if (screens.xs) return "100%";
    if (screens.sm) return "95%";
    if (screens.md) return "90%";
    if (screens.lg) return "85%";
    return "1024px"; // Increased from 768px to allow wider input
  };

  // Responsive padding calculation
  const getContainerPadding = () => {
    if (screens.xs) return token.paddingXS;
    if (screens.sm) return token.paddingSM;
    return token.padding;
  };

  // Ensure all messages have IDs
  useEffect(() => {
    if (currentChatId && currentMessages) {
      const messagesNeedingIds = currentMessages.some((msg) => !msg.id);

      if (messagesNeedingIds) {
        const updatedMessages = currentMessages.map((msg, _index) => {
          if (!msg.id) {
            return { ...msg, id: crypto.randomUUID() };
          }
          return msg;
        });

        updateChat(currentChatId, { messages: updatedMessages });
      }
    }
  }, [currentChatId, currentMessages]);

  // Add event listener for message navigation
  useEffect(() => {
    const handleMessageNavigation = (e: CustomEvent) => {
      const { messageId } = e.detail;
      console.log("Navigation event received for messageId:", messageId);

      if (!messageId) {
        console.error("No messageId provided for navigation");
        return;
      }

      const messageElement = document.getElementById(`message-${messageId}`);
      if (messageElement) {
        console.log("Found message element, scrolling to:", messageId);
        messageElement.scrollIntoView({ behavior: "smooth", block: "center" });

        messageElement.classList.add("highlight-message");
        setTimeout(() => {
          messageElement.classList.remove("highlight-message");
        }, 2000);
      } else {
        console.warn("Message element not found for ID:", messageId);
      }
    };

    window.addEventListener(
      "navigate-to-message",
      handleMessageNavigation as EventListener
    );
    return () => {
      window.removeEventListener(
        "navigate-to-message",
        handleMessageNavigation as EventListener
      );
    };
  }, [currentMessages]);

  // Auto-expand on new chat, auto-collapse after first user message
  useEffect(() => {
    if (currentChatId !== lastChatIdRef.current) {
      if (currentMessages.length === 0) {
        setSystemMsgExpanded(true);
      } else {
        setSystemMsgExpanded(false);
      }
      lastChatIdRef.current = currentChatId;
    } else if (
      currentMessages.length === 1 &&
      currentMessages[0]?.role === "user"
    ) {
      setSystemMsgExpanded(false);
    }
  }, [currentChatId, currentMessages]);

  useEffect(() => {
    if (messagesEndRef.current && currentMessages.length > 0) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [currentMessages, isStreaming]);

  // Handler to show/hide scroll-to-bottom button
  const handleMessagesScroll = () => {
    const el = messagesListRef.current;
    if (!el) return;
    const threshold = 40;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    setShowScrollToBottom(!atBottom);
  };

  // Scroll to bottom function
  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  useEffect(() => {
    scrollToBottom();
    setShowScrollToBottom(false);
  }, [currentMessages, isStreaming]);

  const hasMessages = currentMessages.length > 0;
  const showMessagesView =
    currentChatId && (hasMessages || (isStreaming && activeChannel));

  // Calculate scroll to bottom button position
  const getScrollButtonPosition = () => {
    return screens.xs ? 16 : 32;
  };

  return (
    <Layout
      style={{
        minHeight: "100vh",
        height: "100vh",
        background: token.colorBgContainer,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <Flex
        vertical
        style={{
          flex: 1,
          minHeight: 0,
          height: "100vh",
        }}
      >
        {/* System Message Area */}
        <Flex
          justify="center"
          className={`chat-view-system-message-container ${
            showMessagesView ? "messages-view" : "centered-view"
          }`}
          style={{
            paddingTop: showMessagesView
              ? getContainerPadding()
              : token.paddingXL,
            paddingLeft: getContainerPadding(),
            paddingRight: getContainerPadding(),
            paddingBottom: showMessagesView ? 0 : token.marginXL,
            width: "100%",
            maxWidth: showMessagesView ? getContainerMaxWidth() : "100%",
          }}
        >
          {currentChatId ? (
            <Flex
              vertical
              style={{
                width: "100%",
                maxWidth: showMessagesView ? getContainerMaxWidth() : "100%",
              }}
            >
              <SystemMessage
                isExpandedView={!showMessagesView}
                expanded={systemMsgExpanded}
                onExpandChange={setSystemMsgExpanded}
              />
              {!showMessagesView && !hasMessages && (
                <Empty
                  description="Send a message to start the conversation."
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  style={{
                    marginTop: token.marginMD,
                    textAlign: "center",
                  }}
                />
              )}
            </Flex>
          ) : (
            !showMessagesView && (
              <Empty
                description="Select a chat or start a new one"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                style={{ textAlign: "center" }}
              />
            )
          )}
        </Flex>

        {/* Messages List Area */}
        <Content
          className={`chat-view-messages-list ${
            showMessagesView ? "visible" : "hidden"
          }`}
          style={{
            flex: 1,
            minHeight: 0,
            padding: getContainerPadding(),
            overflowY: "auto",
            opacity: showMessagesView ? 1 : 0,
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
          ref={messagesListRef}
          onScroll={handleMessagesScroll}
        >
          {showMessagesView && (
            <Space
              direction="vertical"
              size={token.marginMD}
              style={{ width: "100%" }}
            >
              {currentMessages
                .filter(
                  (message) =>
                    message.role === "user" || message.role === "assistant"
                )
                .map((message, index) => {
                  const messageCardId =
                    message.id || `msg-${currentChatId}-${index}`;

                  return (
                    <Flex
                      key={index}
                      justify={
                        message.role === "user" ? "flex-end" : "flex-start"
                      }
                      style={{
                        width: "100%",
                        maxWidth: "100%",
                      }}
                    >
                      <div
                        style={{
                          width: message.role === "user" ? "85%" : "100%",
                          maxWidth: screens.xs ? "100%" : "90%",
                        }}
                      >
                        <MessageCard
                          role={message.role}
                          content={message.content}
                          processorUpdates={message.processorUpdates}
                          messageIndex={index}
                          messageId={messageCardId}
                          images={message.images}
                          onDelete={handleDeleteMessage}
                        />
                      </div>
                    </Flex>
                  );
                })}

              {/* AI streaming message */}
              {isStreaming && activeChannel && (
                <Flex justify="flex-start" style={{ width: "100%" }}>
                  <Card
                    bordered={false}
                    style={{
                      maxWidth: "85%",
                      background: token.colorBgLayout,
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
                </Flex>
              )}
              <div ref={messagesEndRef} />
            </Space>
          )}
        </Content>

        {/* Scroll to Bottom Button */}
        {showScrollToBottom && (
          <Button
            type="primary"
            shape="circle"
            icon={<DownOutlined />}
            size={screens.xs ? "middle" : "large"}
            style={{
              position: "fixed",
              right: getScrollButtonPosition(),
              bottom: screens.xs ? 80 : 96,
              zIndex: 100,
              boxShadow: token.boxShadow,
              background: token.colorPrimary,
              color: token.colorBgContainer,
            }}
            onClick={scrollToBottom}
          />
        )}

        {/* Input Container Area */}
        <Flex
          justify="center"
          className={`chat-view-input-container-wrapper ${
            showMessagesView ? "messages-view" : "centered-view"
          }`}
        >
          <div
            style={{
              width: "100%",
              maxWidth: showMessagesView ? getContainerMaxWidth() : "100%",
              margin: showMessagesView ? "0 auto" : undefined,
            }}
          >
            <InputContainer
              isStreaming={isStreaming}
              isCenteredLayout={!showMessagesView}
            />
          </div>
        </Flex>
      </Flex>
    </Layout>
  );
};
