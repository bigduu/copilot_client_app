import React from "react";
import { Flex, Layout } from "antd";

import SystemMessageCard from "../SystemMessageCard";
import MessageCard from "../MessageCard";
import StreamingMessageCard from "../StreamingMessageCard";
import type { Message } from "../../types/chat";

const { Content } = Layout;

type RenderableEntry = {
  message: Message;
  messageType?: "text" | "plan" | "question" | "tool_call" | "tool_result";
};

type InteractionState = {
  matches: (stateName: "IDLE" | "THINKING" | "AWAITING_APPROVAL") => boolean;
};

type ChatMessagesListProps = {
  currentChatId: string | null;
  convertRenderableEntry: (entry: RenderableEntry) => {
    message: Message;
    align: "flex-start" | "flex-end";
    messageType?: "text" | "plan" | "question" | "tool_call" | "tool_result";
  };
  handleDeleteMessage: (messageId: string) => void;
  handleMessagesScroll: () => void;
  hasSystemPrompt: boolean;
  messagesListRef: React.RefObject<HTMLDivElement>;
  renderableMessages: RenderableEntry[];
  rowGap: number;
  rowVirtualizer: {
    getTotalSize: () => number;
    getVirtualItems: () => Array<{ index: number; start: number }>;
    measureElement: (el: HTMLElement | null) => void;
  };
  showMessagesView: boolean;
  screens: { xs?: boolean };
  workflowDraftId?: string;
  interactionState: InteractionState;
  padding: number;
};

export const ChatMessagesList: React.FC<ChatMessagesListProps> = ({
  currentChatId,
  convertRenderableEntry,
  handleDeleteMessage,
  handleMessagesScroll,
  hasSystemPrompt,
  messagesListRef,
  renderableMessages,
  rowGap,
  rowVirtualizer,
  showMessagesView,
  screens,
  workflowDraftId,
  interactionState,
  padding,
}) => {
  return (
    <Content
      className={`chat-view-messages-list ${
        showMessagesView ? "visible" : "hidden"
      }`}
      style={{
        flex: 1,
        minHeight: 0,
        padding,
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
              const isLast = virtualRow.index === renderableMessages.length - 1;

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
                            convertedMessage.role === "user" ? "85%" : "100%",
                          maxWidth: screens.xs ? "100%" : "90%",
                        }}
                      >
                        <MessageCard
                          message={convertedMessage}
                          messageType={messageType}
                          onDelete={
                            convertedMessage.id === workflowDraftId
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
          <Flex
            justify="flex-start"
            style={{ width: "100%", maxWidth: "100%" }}
          >
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
  );
};
