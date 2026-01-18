import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { Layout, theme, Button, Grid, Flex } from "antd";
import { useChatController } from "../../contexts/ChatControllerContext";
import SystemMessageCard from "../SystemMessageCard";
import { DownOutlined } from "@ant-design/icons";
import { InputContainer, type WorkflowDraft } from "../InputContainer";
import "./styles.css"; // Import a new CSS file for animations and specific styles
import MessageCard from "../MessageCard";
import StreamingMessageCard from "../StreamingMessageCard";
import { Message } from "../../types/chat";
import { useVirtualizer } from "@tanstack/react-virtual";
import { streamingMessageBus } from "../../utils/streamingMessageBus";

const { Content } = Layout;
const { useToken } = theme;
const { useBreakpoint } = Grid;

export const ChatView: React.FC = () => {
  const {
    currentChat,
    currentChatId,
    currentMessages,
    deleteMessage,
    updateChat,
    interactionState,
  } = useChatController();

  // Handle message deletion - optimized with useCallback
  const handleDeleteMessage = useCallback(
    (messageId: string) => {
      if (currentChatId) {
        deleteMessage(currentChatId, messageId);
      }
    },
    [currentChatId, deleteMessage]
  );
  const messagesListRef = useRef<HTMLDivElement>(null);
  const { token } = useToken();
  const screens = useBreakpoint();

  // Removed SystemMessage expand/collapse state since it's no longer collapsible
  // Track last chatId to detect chat change
  const lastChatIdRef = useRef<string | null>(null);
  // Scroll-to-bottom button state
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [workflowDraft, setWorkflowDraft] = useState<WorkflowDraft | null>(null);
  // Track if user has manually scrolled up (to prevent auto-scroll interruption)
  const userHasScrolledUpRef = useRef(false);

  // Responsive container width calculation
  const getContainerMaxWidth = () => {
    if (screens.xs) return "100%";
    if (screens.sm) return "100%";
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
  }, [currentChatId, currentMessages, updateChat]);

  // Add event listener for message navigation
  // Track chat changes (SystemMessage no longer needs expand/collapse management)
  useEffect(() => {
    if (currentChatId !== lastChatIdRef.current) {
      lastChatIdRef.current = currentChatId;
    }
  }, [currentChatId]);

  useEffect(() => {
    setWorkflowDraft(null);
  }, [currentChatId]);

  const hasMessages = currentMessages.length > 0;
  const hasWorkflowDraft = Boolean(workflowDraft?.content);

  // Get system prompt message to display
  const systemPromptMessage = useMemo(() => {
    // First, check if there's already a system message in the messages
    const existingSystemMessage = currentMessages.find(
      (msg: Message) => msg.role === "system"
    );
    if (existingSystemMessage) {
      return existingSystemMessage as Message;
    }

    // Use loaded system prompt from context manager
    if (currentChat?.config?.baseSystemPrompt) {
      return {
        id: `system-prompt-${currentChat.id}`,
        role: "system" as const,
        content: currentChat.config.baseSystemPrompt,
        createdAt: new Date(currentChat.createdAt).toISOString(),
      };
    }

    return null;
  }, [currentChat, currentMessages]);

  // Check if we have system prompt to show
  const hasSystemPrompt = useMemo(() => {
    return systemPromptMessage !== null;
  }, [systemPromptMessage]);

  const showMessagesView =
    currentChatId && (hasMessages || hasSystemPrompt || hasWorkflowDraft);

  type RenderableEntry = {
    message: Message;
    messageType?: "text" | "plan" | "question" | "tool_call" | "tool_result";
  };

  /**
   * Helper function to check if a message should be hidden from display.
   * Messages with display_preference: "Hidden" should not be shown in the UI.
   */
  const shouldHideMessage = useCallback((item: Message): boolean => {
    // Check if it's a tool result message with Hidden display preference (Message type)
    if ("type" in item && item.type === "tool_result") {
      const toolResultMsg = item as any;
      if (toolResultMsg.result?.display_preference === "Hidden") {
        return true;
      }
    }

    return false;
  }, []);

  const convertRenderableEntry = useCallback(
    (
      entry: RenderableEntry
    ): {
      message: Message;
      align: "flex-start" | "flex-end";
      messageType?: "text" | "plan" | "question" | "tool_call" | "tool_result";
    } => {
      const align = entry.message.role === "user" ? "flex-end" : "flex-start";

      let resolvedType = entry.messageType;
      if (
        !resolvedType &&
        entry.message.role === "assistant" &&
        "type" in entry.message
      ) {
        const assistantType = (entry.message as any).type as string | undefined;
        if (
          assistantType === "text" ||
          assistantType === "plan" ||
          assistantType === "question" ||
          assistantType === "tool_call" ||
          assistantType === "tool_result"
        ) {
          resolvedType = assistantType;
        }
      }

      return {
        message: entry.message,
        align,
        messageType: resolvedType,
      };
    },
    []
  );

  const renderableMessages = useMemo<RenderableEntry[]>(() => {
    const filtered = currentMessages.filter((item) => {
      const role = item.role;

      // Filter out non-chat roles
      if (
        role !== "user" &&
        role !== "assistant" &&
        role !== "system" &&
        role !== "tool"
      ) {
        return false;
      }

      // Filter out messages with display_preference: "Hidden"
      if (shouldHideMessage(item)) {
        return false;
      }

      return true;
    });

    const hasSystemMessage = filtered.some((item) => item.role === "system");

    const entries: RenderableEntry[] = filtered.map((item) => {
      const message = item as Message;
      let inferredType: RenderableEntry["messageType"];
      if (message.role === "assistant" && "type" in message) {
        const assistantType = (message as any).type as string | undefined;
        if (
          assistantType === "text" ||
          assistantType === "plan" ||
          assistantType === "question" ||
          assistantType === "tool_call" ||
          assistantType === "tool_result"
        ) {
          inferredType = assistantType;
        }
      }

      return {
        message,
        messageType: inferredType,
      };
    });

    if (hasSystemPrompt && systemPromptMessage && !hasSystemMessage) {
      entries.unshift({ message: systemPromptMessage });
    }

    if (workflowDraft?.content) {
      entries.push({
        message: {
          id: workflowDraft.id,
          role: "user",
          content: workflowDraft.content,
          createdAt: workflowDraft.createdAt,
        },
        messageType: "text",
      });
    }

    return entries;
  }, [
    currentMessages,
    hasSystemPrompt,
    systemPromptMessage,
    shouldHideMessage,
    workflowDraft,
  ]);

  const rowVirtualizer = useVirtualizer({
    count: renderableMessages.length,
    getScrollElement: () => messagesListRef.current,
    estimateSize: () => 320,
    overscan: 6,
  });

  const rowGap = token.marginMD;

  useEffect(() => {
    const handleMessageNavigation = (event: Event) => {
      const customEvent = event as CustomEvent<{ messageId: string }>;
      const messageId = customEvent.detail?.messageId;

      if (!messageId) {
        console.error("No messageId provided for navigation");
        return;
      }

      const targetIndex = renderableMessages.findIndex(
        (item) => item.message.id === messageId
      );

      if (targetIndex === -1) {
        console.warn("Message not found for navigation:", messageId);
        return;
      }

      rowVirtualizer.scrollToIndex(targetIndex, { align: "center" });

      setTimeout(() => {
        const messageElement = document.getElementById(`message-${messageId}`);
        if (messageElement) {
          messageElement.classList.add("highlight-message");
          setTimeout(() => {
            messageElement.classList.remove("highlight-message");
          }, 2000);
        }
      }, 200);
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
  }, [renderableMessages, rowVirtualizer]);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesListRef.current;
    if (!el) return;

    // Calculate distance from bottom
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;

    // Use a smaller threshold (5px) to more accurately detect "at bottom"
    const nearBottomThreshold = 5;
    const atBottom = distanceFromBottom < nearBottomThreshold;

    // Update scroll-to-bottom button visibility
    setShowScrollToBottom(!atBottom);

    // Only mark as "manually scrolled up" if user scrolled significantly (>100px from bottom)
    // This prevents accidental small scrolls from disabling auto-scroll
    const significantScrollThreshold = 100;
    if (distanceFromBottom > significantScrollThreshold) {
      userHasScrolledUpRef.current = true;
    } else if (atBottom) {
      // User scrolled back to bottom, reset the flag
      userHasScrolledUpRef.current = false;
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = messagesListRef.current;
    if (!el) return;
    if (interactionState.matches("THINKING")) {
      requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight });
      });
      return;
    }
    if (renderableMessages.length === 0) return;
    requestAnimationFrame(() => {
      rowVirtualizer.scrollToIndex(renderableMessages.length - 1, {
        align: "end",
      });
    });
  }, [interactionState, renderableMessages.length, rowVirtualizer]);

  // Reset scroll flag and scroll to bottom when user sends a message
  // Detect message sending by watching state transition from IDLE to THINKING
  const previousStateRef = useRef(interactionState.value);
  useEffect(() => {
    const currentState = interactionState.value;
    const previousState = previousStateRef.current;

    // User sent a message: state changed from IDLE to THINKING
    if (previousState === "IDLE" && currentState === "THINKING") {
      console.log(
        "[ChatView] User sent message, resetting scroll flag and scrolling to bottom"
      );
      userHasScrolledUpRef.current = false; // Reset flag
      scrollToBottom(); // Scroll to bottom immediately
    }

    previousStateRef.current = currentState;
  }, [interactionState.value, scrollToBottom]);

  useEffect(() => {
    return streamingMessageBus.subscribe((update) => {
      if (update.chatId !== currentChatId) return;
      if (userHasScrolledUpRef.current) return;
      if (!update.content) return;
      scrollToBottom();
    });
  }, [currentChatId, scrollToBottom]);

  // Auto-scroll when new messages are added (only if user hasn't scrolled up)
  useEffect(() => {
    if (!userHasScrolledUpRef.current && renderableMessages.length > 0) {
      scrollToBottom();
    }
  }, [renderableMessages.length, scrollToBottom]);

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
          {(showMessagesView || hasSystemPrompt) &&
            renderableMessages.length > 0 && (
              <div
                style={{
                  height: rowVirtualizer.getTotalSize(),
                  width: "100%",
                  position: "relative",
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const entry = renderableMessages[virtualRow.index];
                  if (!entry) {
                    return null;
                  }

                  const {
                    message: convertedMessage,
                    align,
                    messageType,
                  } = convertRenderableEntry(entry);

                  const key = convertedMessage.id;
                  const isLast =
                    virtualRow.index === renderableMessages.length - 1;

                  return (
                    <div
                      key={key}
                      ref={rowVirtualizer.measureElement}
                      data-index={virtualRow.index}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualRow.start}px)`,
                        paddingBottom: isLast ? 0 : rowGap,
                      }}
                    >
                      {convertedMessage.role === "system" ? (
                        <SystemMessageCard message={convertedMessage} />
                      ) : (
                        <Flex
                          justify={align}
                          style={{ width: "100%", maxWidth: "100%" }}
                        >
                          <div
                            style={{
                              width:
                                convertedMessage.role === "user"
                                  ? "85%"
                                  : "100%",
                              maxWidth: screens.xs ? "100%" : "90%",
                            }}
                          >
                            <MessageCard
                              message={convertedMessage}
                              messageType={messageType}
                              onDelete={
                                convertedMessage.id === workflowDraft?.id
                                  ? undefined
                                  : handleDeleteMessage
                              }
                            />
                          </div>
                        </Flex>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          {interactionState.matches("THINKING") && currentChatId && (
            <div style={{ paddingTop: rowGap }}>
              <Flex justify="flex-start" style={{ width: "100%", maxWidth: "100%" }}>
                <div
                  style={{
                    width: "100%",
                    maxWidth: screens.xs ? "100%" : "90%",
                  }}
                >
                  <StreamingMessageCard chatId={currentChatId} />
                </div>
              </Flex>
            </div>
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
            onClick={() => {
              userHasScrolledUpRef.current = false; // Reset flag when user clicks scroll-to-bottom
              scrollToBottom();
            }}
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
              isCenteredLayout={!showMessagesView}
              onWorkflowDraftChange={setWorkflowDraft}
            />
          </div>
        </Flex>
      </Flex>
    </Layout>
  );
};
