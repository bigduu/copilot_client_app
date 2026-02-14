import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FloatButton, Grid, Layout, theme, Flex } from "antd";
import { DownOutlined, UpOutlined } from "@ant-design/icons";
import { useVirtualizer } from "@tanstack/react-virtual";

import { useAppStore } from "../../store";
import type { Message } from "../../types/chat";
import { ChatInputArea } from "./ChatInputArea";
import { ChatMessagesList } from "./ChatMessagesList";
import { TodoList } from "../../../../components/TodoList";
import { QuestionDialog } from "../../../../components/QuestionDialog";
import { useAgentEventSubscription } from "../../../../hooks/useAgentEventSubscription";
import { TokenUsageDisplay } from "../TokenUsageDisplay";
import "./styles.css";
import { useChatViewScroll } from "./useChatViewScroll";
import type { WorkflowDraft } from "../InputContainer";
import { useChatViewMessages, type RenderableEntry } from "./useChatViewMessages";

const { useToken } = theme;
const { useBreakpoint } = Grid;

export const ChatView: React.FC = () => {
  // Maintain persistent subscription to agent events for real-time streaming
  useAgentEventSubscription();

  const currentChatId = useAppStore((state) => state.currentChatId);
  const currentChat = useAppStore(
    (state) =>
      state.chats.find((chat) => chat.id === state.currentChatId) || null,
  );
  const deleteMessage = useAppStore((state) => state.deleteMessage);
  const updateChat = useAppStore((state) => state.updateChat);
  const isProcessing = useAppStore((state) => state.isProcessing);
  const tokenUsages = useAppStore((state) => state.tokenUsages);
  const truncationOccurred = useAppStore((state) => state.truncationOccurred);
  const segmentsRemoved = useAppStore((state) => state.segmentsRemoved);
  const currentMessages = useMemo(
    () => currentChat?.messages || [],
    [currentChat],
  );
  const interactionState = useMemo(() => {
    const value: "IDLE" | "THINKING" | "AWAITING_APPROVAL" = isProcessing
      ? "THINKING"
      : "IDLE";
    return {
      value,
      context: {
        streamingContent: null,
        toolCallRequest: null,
        parsedParameters: null,
      },
      matches: (stateName: "IDLE" | "THINKING" | "AWAITING_APPROVAL") =>
        stateName === value,
    };
  }, [isProcessing]);

  const handleDeleteMessage = useCallback(
    (messageId: string) => {
      if (currentChatId) {
        deleteMessage(currentChatId, messageId);
      }
    },
    [currentChatId, deleteMessage],
  );

  const messagesListRef = useRef<HTMLDivElement>(null);
  const { token } = useToken();
  const screens = useBreakpoint();
  const [workflowDraft, setWorkflowDraft] = useState<WorkflowDraft | null>(
    null,
  );

  const getContainerMaxWidth = () => {
    if (screens.xs) return "100%";
    if (screens.sm) return "100%";
    if (screens.md) return "90%";
    if (screens.lg) return "85%";
    return "1024px";
  };

  const getContainerPadding = () => {
    if (screens.xs) return token.paddingXS;
    if (screens.sm) return token.paddingSM;
    return token.padding;
  };

  useEffect(() => {
    if (currentChatId && currentMessages) {
      const messagesNeedingIds = currentMessages.some((msg) => !msg.id);

      if (messagesNeedingIds) {
        const updatedMessages = currentMessages.map((msg) => {
          if (!msg.id) {
            return { ...msg, id: crypto.randomUUID() };
          }
          return msg;
        });

        updateChat(currentChatId, { messages: updatedMessages });
      }
    }
  }, [currentChatId, currentMessages, updateChat]);

  useEffect(() => {
    setWorkflowDraft(null);
  }, [currentChatId]);

  const { systemPromptMessage, renderableMessages, convertRenderableEntry } =
    useChatViewMessages(currentChat, currentMessages);

  const hasMessages = currentMessages.length > 0;
  const hasWorkflowDraft = Boolean(workflowDraft?.content);
  const hasSystemPrompt = Boolean(systemPromptMessage);
  const showMessagesView =
    currentChatId && (hasMessages || hasSystemPrompt || hasWorkflowDraft);

  const renderableMessagesWithDraft = useMemo<RenderableEntry[]>(() => {
    if (!workflowDraft?.content) {
      return renderableMessages;
    }

    const draftEntry: RenderableEntry = {
      message: {
        id: workflowDraft.id,
        role: "user",
        content: workflowDraft.content,
        createdAt: workflowDraft.createdAt,
      } as Message,
      messageType: "text" as const,
    };

    return [...renderableMessages, draftEntry];
  }, [renderableMessages, workflowDraft]);

  // Get agent session ID from chat config (created by Agent Server)
  const agentSessionId = currentChat?.config?.agentSessionId;

  // Get token usage - prefer store (real-time), fallback to chat config (persisted)
  const storeTokenUsage = currentChatId ? tokenUsages[currentChatId] : null;
  const configTokenUsage = currentChat?.config?.tokenUsage;
  const currentTokenUsage = storeTokenUsage || configTokenUsage || null;

  const storeTruncation = currentChatId ? truncationOccurred[currentChatId] : false;
  const configTruncation = currentChat?.config?.truncationOccurred;
  const currentTruncationOccurred = storeTruncation || configTruncation || false;

  const storeSegments = currentChatId ? segmentsRemoved[currentChatId] : 0;
  const configSegments = currentChat?.config?.segmentsRemoved;
  const currentSegmentsRemoved = storeSegments || configSegments || 0;

  const rowVirtualizer = useVirtualizer({
    count: renderableMessagesWithDraft.length,
    getScrollElement: () => messagesListRef.current,
    estimateSize: () => 320,
    overscan: 6,
  });

  const rowGap = token.marginMD;

  const {
    handleMessagesScroll,
    resetUserScroll,
    scrollToBottom,
    scrollToTop,
    showScrollToBottom,
    showScrollToTop,
  } = useChatViewScroll({
    currentChatId,
    interactionState,
    messagesListRef,
    renderableMessages: renderableMessagesWithDraft,
    rowVirtualizer,
  });

  const getScrollButtonPosition = () => {
    return screens.xs ? 16 : 32;
  };

  return (
    <Layout
      style={{
        flex: 1,
        minHeight: 0,
        height: "100%",
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
          height: "100%",
        }}
      >
        {/* TodoList - show when there is an active agent session */}
        {agentSessionId && (
          <div
            style={{
              padding: `0 ${getContainerPadding()}px`,
              paddingTop: getContainerPadding(),
              maxWidth: getContainerMaxWidth(),
              margin: "0 auto",
              width: "100%",
            }}
          >
            <TodoList
              sessionId={agentSessionId}
              initialCollapsed={true}
            />
          </div>
        )}

        {/* QuestionDialog - show when there's an active agent session */}
        {agentSessionId && (
          <div
            style={{
              padding: `0 ${getContainerPadding()}px`,
              paddingTop: getContainerPadding(),
              maxWidth: getContainerMaxWidth(),
              margin: "0 auto",
              width: "100%",
            }}
          >
            <QuestionDialog
              sessionId={agentSessionId}
            />
          </div>
        )}

        {/* Token Usage Display - show when there's token usage data */}
        {currentTokenUsage && currentTokenUsage.budgetLimit > 0 && (
          <div
            style={{
              padding: `0 ${getContainerPadding()}px`,
              paddingTop: agentSessionId ? token.paddingXS : getContainerPadding(),
              maxWidth: getContainerMaxWidth(),
              margin: "0 auto",
              width: "100%",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: token.marginXS,
              }}
            >
              <TokenUsageDisplay
                usage={currentTokenUsage}
                showDetails={true}
                size="small"
              />
              {currentTruncationOccurred && (
                <span
                  style={{
                    fontSize: 11,
                    color: token.colorTextSecondary,
                  }}
                >
                  ({currentSegmentsRemoved} truncated)
                </span>
              )}
            </div>
          </div>
        )}

        <ChatMessagesList
          currentChatId={currentChatId}
          convertRenderableEntry={convertRenderableEntry}
          handleDeleteMessage={handleDeleteMessage}
          handleMessagesScroll={handleMessagesScroll}
          hasSystemPrompt={hasSystemPrompt}
          messagesListRef={messagesListRef}
          renderableMessages={renderableMessagesWithDraft}
          rowGap={rowGap}
          rowVirtualizer={rowVirtualizer}
          showMessagesView={Boolean(showMessagesView)}
          screens={screens}
          workflowDraftId={workflowDraft?.id}
          interactionState={interactionState}
          padding={getContainerPadding()}
        />

        {/* 滚动按钮组 - 都在右下角 */}
        {(showScrollToTop || showScrollToBottom) && (
          <FloatButton.Group
            style={{
              right: getScrollButtonPosition(),
              bottom: screens.xs ? 160 : 180,
              gap: token.marginSM,
              zIndex: 1000,
            }}
          >
            {showScrollToTop && (
              <FloatButton
                type="default"
                icon={<UpOutlined />}
                onClick={() => {
                  scrollToTop();
                }}
              />
            )}
            {showScrollToBottom && (
              <FloatButton
                type="primary"
                icon={<DownOutlined />}
                onClick={() => {
                  resetUserScroll();
                  scrollToBottom();
                }}
              />
            )}
          </FloatButton.Group>
        )}

        <ChatInputArea
          isCenteredLayout={!showMessagesView}
          maxWidth={showMessagesView ? getContainerMaxWidth() : "100%"}
          onWorkflowDraftChange={setWorkflowDraft}
          showMessagesView={Boolean(showMessagesView)}
        />
      </Flex>
    </Layout>
  );
};
