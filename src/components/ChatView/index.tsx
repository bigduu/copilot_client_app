import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { Layout, theme, Button, Grid, Flex, Modal } from "antd";
import { useChatController } from "../../contexts/ChatControllerContext";
import SystemMessageCard from "../SystemMessageCard";
import { DownOutlined } from "@ant-design/icons";
import { InputContainer } from "../InputContainer";
import { ApprovalModal } from "../ApprovalModal";
import { AgentApprovalModal } from "../AgentApprovalModal";
import "./styles.css"; // Import a new CSS file for animations and specific styles
import MessageCard from "../MessageCard";
import { useBackendContext } from "../../hooks/useBackendContext";
import { BranchSelector } from "../BranchSelector";
import AgentRoleSelector from "../AgentRoleSelector";
import { Message } from "../../types/chat";
import {
  MessageDTO,
  backendContextService,
} from "../../services/BackendContextService";
import { useAppStore } from "../../store";
import { useVirtualizer } from "@tanstack/react-virtual";
import { transformMessageDTOToMessage } from "../../utils/messageTransformers";

const { Content } = Layout;
const { useToken } = theme;
const { useBreakpoint } = Grid;

export const ChatView: React.FC = () => {
  const {
    currentChatId,
    currentMessages,
    deleteMessage,
    updateChat,
    interactionState,
    send,
    pendingAgentApproval,
    setPendingAgentApproval,
  } = useChatController();

  // Backend context for approvals and basic status display
  const {
    currentContext,
    messages: backendMessages,
    approveTools,
    switchBranch,
    updateAgentRole,
    isLoading,
    error,
    loadContext,
  } = useBackendContext();

  // Auto-load backend context when currentChatId changes
  useEffect(() => {
    if (currentChatId && currentChatId !== currentContext?.id) {
      console.log(`[ChatView] Loading context for chat: ${currentChatId}`);
      loadContext(currentChatId).catch((err) => {
        console.error(`[ChatView] Failed to load context:`, err);
      });
    }
  }, [currentChatId, currentContext?.id, loadContext]);

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

  const [loadedSystemPrompt, setLoadedSystemPrompt] = useState<{
    id: string;
    content: string;
  } | null>(null);

  const hasMessages = currentMessages.length > 0;
  const hasBackendMessages = backendMessages.length > 0;

  // Load system prompt from context manager - unified source of truth
  useEffect(() => {
    const loadSystemPrompt = async () => {
      // First, check if there's already a system message in the messages
      const allMessages =
        backendMessages.length > 0 ? backendMessages : currentMessages;
      const existingSystemMessage = allMessages.find(
        (msg: Message | MessageDTO) => msg.role === "system"
      );
      if (existingSystemMessage) {
        setLoadedSystemPrompt(null);
        return;
      }

      // Priority 1: Get from active branch's system_prompt (if exists)
      if (currentContext?.branches && currentContext.branches.length > 0) {
        const activeBranch = currentContext.branches.find(
          (b) => b.name === currentContext.active_branch_name
        );
        if (activeBranch?.system_prompt?.content) {
          setLoadedSystemPrompt({
            id: activeBranch.system_prompt.id,
            content: activeBranch.system_prompt.content,
          });
          return;
        }
      }

      // Priority 2: Get from context.config.system_prompt_id (source of truth)
      const systemPromptId = currentContext?.config?.system_prompt_id;

      if (!systemPromptId) {
        setLoadedSystemPrompt(null);
        return;
      }

      // Fetch system prompt content from backend API using the ID
      try {
        const prompt =
          await backendContextService.getSystemPrompt(systemPromptId);
        if (prompt?.content) {
          setLoadedSystemPrompt({
            id: systemPromptId,
            content: prompt.content,
          });
        } else {
          console.warn(
            `System prompt ${systemPromptId} exists but has no content`
          );
          setLoadedSystemPrompt(null);
        }
      } catch (error) {
        console.error(
          `Failed to load system prompt ${systemPromptId} from backend:`,
          error
        );
        setLoadedSystemPrompt(null);
      }
    };

    loadSystemPrompt();
  }, [
    currentContext?.config?.system_prompt_id,
    currentContext?.branches,
    currentContext?.active_branch_name,
    backendMessages,
    currentMessages,
  ]);

  // Get system prompt message to display
  const systemPromptMessage = useMemo(() => {
    // First, check if there's already a system message in the messages
    const allMessages =
      backendMessages.length > 0 ? backendMessages : currentMessages;
    const existingSystemMessage = allMessages.find(
      (msg: Message | MessageDTO) => msg.role === "system"
    );
    if (existingSystemMessage) {
      // Extract content from MessageDTO if needed
      if (
        "content" in existingSystemMessage &&
        Array.isArray((existingSystemMessage as any).content)
      ) {
        const dto = existingSystemMessage as MessageDTO;
        const textContent = dto.content.find((c) => c.type === "text");
        const messageContent =
          textContent && "text" in textContent ? textContent.text : "";
        return {
          id: dto.id,
          role: "system" as const,
          content: messageContent,
          createdAt: dto.id,
        };
      }
      // Already a Message type
      return existingSystemMessage as Message;
    }

    // Use loaded system prompt from context manager
    if (loadedSystemPrompt?.content) {
      return {
        id: `system-prompt-${loadedSystemPrompt.id}`,
        role: "system" as const,
        content: loadedSystemPrompt.content,
        createdAt: new Date().toISOString(),
      };
    }

    return null;
  }, [backendMessages, currentMessages, loadedSystemPrompt]);

  // Check if we have system prompt to show
  const hasSystemPrompt = useMemo(() => {
    return systemPromptMessage !== null;
  }, [systemPromptMessage]);

  const showMessagesView =
    currentChatId && (hasMessages || hasBackendMessages || hasSystemPrompt);

  type RenderableEntry = {
    message: Message;
    messageType?: MessageDTO["message_type"];
  };

  const convertRenderableEntry = useCallback(
    (
      entry: RenderableEntry
    ): {
      message: Message;
      align: "flex-start" | "flex-end";
      messageType?: MessageDTO["message_type"];
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
    const source =
      backendMessages.length > 0 ? backendMessages : currentMessages;

    const filtered = source.filter((item) => {
      const role = (item as Message).role ?? (item as MessageDTO).role;
      return (
        role === "user" ||
        role === "assistant" ||
        role === "system" ||
        role === "tool"
      );
    });

    const hasSystemMessage = filtered.some((item) => {
      const role = (item as Message).role ?? (item as MessageDTO).role;
      return role === "system";
    });

    const entries: RenderableEntry[] = filtered.map((item) => {
      if ("message_type" in item && Array.isArray((item as any).content)) {
        const dto = item as MessageDTO;
        const transformed = transformMessageDTOToMessage(dto);
        return {
          message: transformed,
          messageType: dto.message_type,
        };
      }

      const message = item as Message;
      let inferredType: MessageDTO["message_type"] | undefined;
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

    return entries;
  }, [backendMessages, currentMessages, hasSystemPrompt, systemPromptMessage]);

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
    const threshold = 40;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    setShowScrollToBottom(!atBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    if (renderableMessages.length === 0) return;
    rowVirtualizer.scrollToIndex(renderableMessages.length - 1, {
      align: "end",
    });
  }, [renderableMessages.length, rowVirtualizer]);

  useEffect(() => {
    if (!showScrollToBottom) {
      scrollToBottom();
    }
  }, [
    showScrollToBottom,
    scrollToBottom,
    interactionState.context.streamingContent,
  ]);

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
        {/* Backend status banners */}
        {isLoading && (
          <div
            style={{
              width: "100%",
              padding: `${token.paddingXS}px ${token.padding}px`,
              background: token.colorWarningBg,
              color: token.colorWarningText,
              borderBottom: `1px solid ${token.colorWarningBorder}`,
            }}
          >
            Syncing with backend...
          </div>
        )}
        {error && (
          <div
            style={{
              width: "100%",
              padding: `${token.paddingXS}px ${token.padding}px`,
              background: token.colorErrorBg,
              color: token.colorErrorText,
              borderBottom: `1px solid ${token.colorErrorBorder}`,
            }}
          >
            {error}
          </div>
        )}
        {/* Agent Role Selector and Branch Selector */}
        {currentContext && (
          <div
            style={{
              width: "100%",
              padding: `${token.paddingXS}px ${token.padding}px`,
              background: token.colorBgContainer,
              borderBottom: `1px solid ${token.colorBorder}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: token.marginMD,
              flexWrap: "wrap",
            }}
          >
            {/* Agent Role Selector */}
            <Flex align="center" gap={token.marginSM}>
              <span
                style={{
                  fontSize: token.fontSizeSM,
                  color: token.colorTextSecondary,
                }}
              >
                Agent Role:
              </span>
              <AgentRoleSelector
                currentRole={currentContext.config.agent_role || "actor"}
                contextId={currentContext.id}
                onRoleChange={async (newRole) => {
                  try {
                    await updateAgentRole(currentContext.id, newRole);
                  } catch (error) {
                    console.error("Failed to update agent role:", error);
                  }
                }}
                disabled={isLoading}
              />
            </Flex>

            {/* Branch Selector */}
            {currentContext.branches.length > 1 && (
              <BranchSelector
                branches={currentContext.branches}
                currentBranch={currentContext.active_branch_name}
                onBranchChange={(branchName) => {
                  if (currentContext?.id) {
                    switchBranch(currentContext.id, branchName);
                  }
                }}
                disabled={isLoading}
              />
            )}
          </div>
        )}
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

                  const key = `${convertedMessage.id}-${virtualRow.index}`;
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
                              onDelete={handleDeleteMessage}
                            />
                          </div>
                        </Flex>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
        </Content>

        {/* Real Approval Modal */}
        {interactionState.matches("AWAITING_APPROVAL") &&
          interactionState.context.toolCallRequest && (
            <ApprovalModal
              visible={true}
              toolName={interactionState.context.toolCallRequest.tool_name}
              parameters={interactionState.context.parsedParameters || []}
              onApprove={async () => {
                try {
                  const contextId = currentContext?.id;
                  const toolCallId =
                    interactionState.context.toolCallRequest?.toolCallId;
                  const ids: string[] = toolCallId ? [toolCallId] : [];

                  if (contextId && ids.length > 0) {
                    await approveTools(contextId, ids);
                  } else {
                    // Fallback to legacy local flow
                    send({ type: "USER_APPROVES" });
                  }
                } catch (e) {
                  // On error, fallback to legacy local flow
                  send({ type: "USER_APPROVES" });
                }
              }}
              onReject={() => send({ type: "USER_REJECTS" })}
            />
          )}

        {/* Agent Approval Modal (for LLM-initiated tool calls) */}
        {pendingAgentApproval && (
          <AgentApprovalModal
            visible={true}
            requestId={pendingAgentApproval.request_id}
            toolName={pendingAgentApproval.tool}
            toolDescription={pendingAgentApproval.tool_description}
            parameters={pendingAgentApproval.parameters}
            onApprove={async (requestId: string) => {
              console.log("🔓 [ChatView] Approving agent tool:", requestId);
              try {
                // Call the backend approval endpoint
                const response =
                  await backendContextService.approveAgentToolCall(
                    pendingAgentApproval.session_id,
                    requestId,
                    true
                  );
                console.log("✅ [ChatView] Tool approved, response:", response);

                // Clear the pending approval
                setPendingAgentApproval(null);

                // Reload messages to show the tool execution result
                console.log(
                  "🔄 [ChatView] Reloading messages after approval..."
                );
                if (currentChatId) {
                  // Fetch messages from backend
                  const messages =
                    await backendContextService.getMessages(currentChatId);

                  const allMessages = messages.messages.map(
                    transformMessageDTOToMessage
                  );

                  // Update useChatManager's messages
                  const { setMessages } = useAppStore.getState();
                  setMessages(currentChatId, allMessages);
                  console.log(
                    `✅ [ChatView] Updated messages: ${allMessages.length} total`
                  );

                  // Also reload backend context for consistency
                  await loadContext(currentChatId);
                }
              } catch (error) {
                console.error("Failed to approve tool:", error);
                Modal.error({
                  title: "Approval Failed",
                  content:
                    "Failed to send approval to backend. Please try again.",
                });
              }
            }}
            onReject={async (requestId: string, reason?: string) => {
              console.log(
                "🚫 [ChatView] Rejecting agent tool:",
                requestId,
                reason
              );
              try {
                // Call the backend approval endpoint
                const response =
                  await backendContextService.approveAgentToolCall(
                    pendingAgentApproval.session_id,
                    requestId,
                    false,
                    reason
                  );
                console.log("✅ [ChatView] Tool rejected, response:", response);

                // Clear the pending approval
                setPendingAgentApproval(null);

                // Reload messages to reflect the rejection
                console.log(
                  "🔄 [ChatView] Reloading messages after rejection..."
                );
                if (currentChatId) {
                  // Fetch messages from backend
                  const messages =
                    await backendContextService.getMessages(currentChatId);

                  const allMessages = messages.messages.map(
                    transformMessageDTOToMessage
                  );

                  // Update useChatManager's messages
                  const { setMessages } = useAppStore.getState();
                  setMessages(currentChatId, allMessages);
                  console.log(
                    `✅ [ChatView] Updated messages: ${allMessages.length} total`
                  );

                  // Also reload backend context for consistency
                  await loadContext(currentChatId);
                }
              } catch (error) {
                console.error("Failed to reject tool:", error);
                Modal.error({
                  title: "Rejection Failed",
                  content:
                    "Failed to send rejection to backend. Please try again.",
                });
              }
            }}
          />
        )}

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
            <InputContainer isCenteredLayout={!showMessagesView} />
          </div>
        </Flex>
      </Flex>
    </Layout>
  );
};
