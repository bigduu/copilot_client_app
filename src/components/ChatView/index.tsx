import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { Layout, Space, theme, Button, Grid, Flex, Modal } from "antd";
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

const { Content } = Layout;
const { useToken } = theme;
const { useBreakpoint } = Grid;

export const ChatView: React.FC = () => {
  const {
    currentChatId,
    currentChat,
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
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

  // Track chat changes (SystemMessage no longer needs expand/collapse management)
  useEffect(() => {
    if (currentChatId !== lastChatIdRef.current) {
      lastChatIdRef.current = currentChatId;
    }
  }, [currentChatId]);

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
    if (!showScrollToBottom) {
      scrollToBottom();
    }
  }, [
    currentMessages,
    interactionState.context.streamingContent,
    showScrollToBottom,
  ]);

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
        const prompt = await backendContextService.getSystemPrompt(
          systemPromptId
        );
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
          {(showMessagesView || hasSystemPrompt) && (
            <Space
              direction="vertical"
              size={token.marginMD}
              style={{ width: "100%" }}
            >
              {/* Show System Prompt as a message at the top of the list */}
              {hasSystemPrompt &&
                systemPromptMessage &&
                !backendMessages.some(
                  (msg: Message | MessageDTO) => msg.role === "system"
                ) &&
                !currentMessages.some(
                  (msg: Message) => msg.role === "system"
                ) && <SystemMessageCard message={systemPromptMessage} />}

              {/* Use backend messages if available, otherwise fall back to currentMessages */}
              {(backendMessages.length > 0 ? backendMessages : currentMessages)
                .filter(
                  (message: Message | MessageDTO) =>
                    message.role === "user" ||
                    message.role === "assistant" ||
                    message.role === "system" ||
                    message.role === "tool" // ✅ Include tool messages
                )
                .map((message: Message | MessageDTO, index: number) => {
                  // Check if this is a MessageDTO from backend
                  const isMessageDTO =
                    "message_type" in message &&
                    Array.isArray((message as any).content);

                  // Extract message_type if it's a MessageDTO
                  let messageType:
                    | "text"
                    | "plan"
                    | "question"
                    | "tool_call"
                    | "tool_result"
                    | undefined = undefined;
                  let convertedMessage: Message;

                  if (isMessageDTO) {
                    const dto = message as MessageDTO;
                    messageType = dto.message_type;

                    // Extract text content from MessageDTO
                    const textContent = dto.content.find(
                      (c) => c.type === "text"
                    );
                    const messageContent =
                      textContent && "text" in textContent
                        ? textContent.text
                        : "";

                    // Convert MessageDTO to Message based on role
                    if (dto.role === "system") {
                      convertedMessage = {
                        id: dto.id,
                        role: "system",
                        content: messageContent,
                        createdAt: dto.id,
                      };
                    } else if (dto.role === "user") {
                      convertedMessage = {
                        id: dto.id,
                        role: "user",
                        content: messageContent,
                        createdAt: dto.id,
                      };
                    } else if (dto.role === "tool") {
                      // ✅ Tool message - display as assistant with prefix
                      convertedMessage = {
                        id: dto.id,
                        role: "assistant",
                        content: `[Tool Result]\n${messageContent}`,
                        type: "text",
                        createdAt: dto.id,
                      } as Message;
                    } else {
                      // Assistant message
                      convertedMessage = {
                        id: dto.id,
                        role: "assistant",
                        content: messageContent,
                        type:
                          messageType === "tool_call"
                            ? "tool_call"
                            : messageType === "tool_result"
                            ? "tool_result"
                            : "text",
                        createdAt: dto.id,
                      } as Message;
                    }
                  } else {
                    // Already a Message type
                    convertedMessage = message as Message;
                    messageType = undefined; // Will be detected from content in MessageCard
                  }

                  if (convertedMessage.role === "system") {
                    return (
                      <SystemMessageCard
                        key={index}
                        message={convertedMessage}
                      />
                    );
                  }

                  return (
                    <Flex
                      key={index}
                      justify={
                        convertedMessage.role === "user"
                          ? "flex-end"
                          : "flex-start"
                      }
                      style={{
                        width: "100%",
                        maxWidth: "100%",
                      }}
                    >
                      <div
                        style={{
                          width:
                            convertedMessage.role === "user" ? "85%" : "100%",
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
                  );
                })}

              <div ref={messagesEndRef} />
            </Space>
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
                  const messages = await backendContextService.getMessages(
                    currentChatId
                  );

                  // Transform messages (same logic as useChatManager)
                  const allMessages = messages.messages
                    .map((msg: any) => {
                      const baseContent =
                        msg.content
                          .map((c: any) => {
                            if (c.type === "text") return c.text;
                            if (c.type === "image") return c.url;
                            return "";
                          })
                          .join("\n") || "";
                      const roleLower = msg.role.toLowerCase();
                      if (roleLower === "user") {
                        return {
                          id: msg.id,
                          role: "user" as const,
                          content: baseContent,
                          createdAt: new Date().toISOString(),
                        };
                      } else if (roleLower === "assistant") {
                        return {
                          id: msg.id,
                          role: "assistant" as const,
                          type: "text" as const,
                          content: baseContent,
                          createdAt: new Date().toISOString(),
                        };
                      } else if (roleLower === "tool") {
                        return {
                          id: msg.id,
                          role: "assistant" as const,
                          type: "text" as const,
                          content: `[Tool Result]\n${baseContent}`,
                          createdAt: new Date().toISOString(),
                        };
                      }
                      return null;
                    })
                    .filter(Boolean) as Message[];

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
                  const messages = await backendContextService.getMessages(
                    currentChatId
                  );

                  // Transform messages (same logic as useChatManager)
                  const allMessages = messages.messages
                    .map((msg: any) => {
                      const baseContent =
                        msg.content
                          .map((c: any) => {
                            if (c.type === "text") return c.text;
                            if (c.type === "image") return c.url;
                            return "";
                          })
                          .join("\n") || "";
                      const roleLower = msg.role.toLowerCase();
                      if (roleLower === "user") {
                        return {
                          id: msg.id,
                          role: "user" as const,
                          content: baseContent,
                          createdAt: new Date().toISOString(),
                        };
                      } else if (roleLower === "assistant") {
                        return {
                          id: msg.id,
                          role: "assistant" as const,
                          type: "text" as const,
                          content: baseContent,
                          createdAt: new Date().toISOString(),
                        };
                      } else if (roleLower === "tool") {
                        return {
                          id: msg.id,
                          role: "assistant" as const,
                          type: "text" as const,
                          content: `[Tool Result]\n${baseContent}`,
                          createdAt: new Date().toISOString(),
                        };
                      }
                      return null;
                    })
                    .filter(Boolean) as Message[];

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
