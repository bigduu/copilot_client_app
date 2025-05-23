import React, { useEffect, useRef, useState } from "react";
import {
  Layout,
  Empty,
  Typography,
  List,
  Card,
  Space,
  theme,
  Button,
} from "antd";
import { useChat } from "../../contexts/ChatContext";
import SystemMessage from "../SystemMessage";
import StreamingMessageItem from "../StreamingMessageItem";
import { DownOutlined } from "@ant-design/icons";
import { InputContainer } from "../InputContainer";
import "./ChatView.css"; // Import a new CSS file for animations and specific styles
import MessageCard from "../MessageCard";

const { Content } = Layout;
const { Text } = Typography;
const { useToken } = theme;

interface ChatViewProps {
  showFavorites: boolean;
  setShowFavorites: React.Dispatch<React.SetStateAction<boolean>>;
}

export const ChatView: React.FC<ChatViewProps> = ({
  showFavorites,
  setShowFavorites,
}) => {
  const {
    currentChatId,
    currentMessages,
    isStreaming,
    activeChannel,
    addAssistantMessage,
    updateChat,
  } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesListRef = useRef<HTMLDivElement>(null);
  const { token } = useToken();

  // SystemMessage expand/collapse state
  const [systemMsgExpanded, setSystemMsgExpanded] = useState(true);
  // Track last chatId to detect chat change
  const lastChatIdRef = useRef<string | null>(null);
  // Scroll-to-bottom button state
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  // Ensure all messages have IDs
  useEffect(() => {
    if (currentChatId && currentMessages) {
      // Check if any message doesn't have an ID
      const messagesNeedingIds = currentMessages.some((msg) => !msg.id);

      if (messagesNeedingIds) {
        // Create a copy of messages with IDs added where needed
        const updatedMessages = currentMessages.map((msg, _index) => {
          if (!msg.id) {
            return { ...msg, id: crypto.randomUUID() };
          }
          return msg;
        });

        // Update the chat with the new messages array
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

      // Find the message element by ID and scroll to it
      const messageElement = document.getElementById(`message-${messageId}`);
      if (messageElement) {
        console.log("Found message element, scrolling to:", messageId);
        messageElement.scrollIntoView({ behavior: "smooth", block: "center" });

        // Highlight the message briefly
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
      // Only expand if it's a new chat with no messages
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
      setSystemMsgExpanded(false); // First user message: collapse
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
    // Show button if not at bottom (allowing a small threshold)
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
    // Hide button when new messages arrive (auto scroll)
    scrollToBottom();
    setShowScrollToBottom(false);
  }, [currentMessages, isStreaming]);

  const hasMessages = currentMessages.length > 0;
  const showMessagesView =
    currentChatId && (hasMessages || (isStreaming && activeChannel));

  return (
    <Layout
      style={{
        minHeight: "100vh", // Ensure the layout fills the viewport
        height: "100vh",
        background: token.colorBgContainer,
        position: "relative", // For positioning animated elements
        overflow: "hidden", // Prevent scrollbars from animated elements moving out
        display: "flex",
        flexDirection: "column", // Changed from "row" to "column"
      }}
    >
      <Layout
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0, // Allow children to shrink
          height: "100vh",
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
            width: "100%",
            maxWidth: showMessagesView ? "clamp(320px, 98vw, 768px)" : "100%",
            display: "flex",
            justifyContent: "center",
          }}
        >
          {currentChatId ? (
            <>
              <div
                style={{
                  width: "100%",
                  maxWidth: showMessagesView
                    ? "clamp(320px, 98vw, 768px)"
                    : "100%",
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
                    style={{ marginTop: token.marginMD, textAlign: "center" }}
                  />
                )}
              </div>
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
            minHeight: 0, // Allow flex children to shrink
            padding: token.padding,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: token.marginMD,
            opacity: showMessagesView ? 1 : 0,
            scrollbarWidth: "none", // Firefox
            msOverflowStyle: "none", // IE and Edge
          }}
          ref={messagesListRef}
          onScroll={handleMessagesScroll}
        >
          {showMessagesView &&
            currentMessages
              .filter(
                (message) =>
                  message.role === "user" || message.role === "assistant"
              )
              .map((message, index) => {
                const messageCardId =
                  message.id || `msg-${currentChatId}-${index}`;
                return (
                  <List.Item
                    key={index}
                    style={{
                      padding: token.paddingXS,
                      border: "none",
                      display: "flex",
                      justifyContent:
                        message.role === "user" ? "flex-end" : "flex-start",
                      width: "100%",
                      maxWidth: "100%",
                    }}
                  >
                    <div
                      style={{
                        width: message.role === "user" ? "85%" : "100%",
                        maxWidth: "clamp(320px, 85%, 90%)",
                        display: "flex",
                        justifyContent:
                          message.role === "user" ? "flex-end" : "flex-start",
                      }}
                    >
                      <MessageCard
                        role={message.role}
                        content={message.content}
                        processorUpdates={message.processorUpdates} // Add this line
                        messageIndex={index}
                        messageId={messageCardId}
                      />
                    </div>
                  </List.Item>
                );
              })}

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

        {/* Scroll to Bottom Button - adjusted position for MainLayout integration */}
        {showScrollToBottom && (
          <Button
            type="primary"
            shape="circle"
            icon={<DownOutlined />}
            size="large"
            style={{
              position: "fixed",
              right: showFavorites ? 432 : 32, // Position depends on favorites panel visibility
              bottom: 96,
              zIndex: 100,
              boxShadow: token.boxShadow,
              background: token.colorPrimary,
              color: token.colorBgContainer,
            }}
            onClick={scrollToBottom}
          />
        )}

        {/* Input Container Area - transitions between bottom and centered view */}
        <div
          className={`chat-view-input-container-wrapper ${
            showMessagesView ? "messages-view" : "centered-view"
          }`}
        >
          <div
            style={{
              width: "100%",
              maxWidth: showMessagesView ? "clamp(320px, 98vw, 768px)" : "100%",
              margin: showMessagesView ? "0 auto" : undefined,
            }}
          >
            <InputContainer
              isStreaming={isStreaming}
              isCenteredLayout={!showMessagesView}
            />
          </div>
        </div>
      </Layout>
    </Layout>
  );
};
