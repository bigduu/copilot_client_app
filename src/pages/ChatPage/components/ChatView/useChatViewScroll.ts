import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { streamingMessageBus } from "../../utils/streamingMessageBus";
import type { Message } from "../../types/chat";

type InteractionState = {
  value: "IDLE" | "THINKING" | "AWAITING_APPROVAL";
  matches: (stateName: "IDLE" | "THINKING" | "AWAITING_APPROVAL") => boolean;
};

type ScrollEntry = {
  message?: Message;
  type?: string;
  id?: string;
};

type UseChatViewScrollArgs = {
  currentChatId: string | null;
  interactionState: InteractionState;
  messagesListRef: RefObject<HTMLDivElement>;
  renderableMessages: ScrollEntry[];
  rowVirtualizer: {
    scrollToIndex: (
      index: number,
      options?: { align?: "start" | "center" | "end" },
    ) => void;
  };
};

export const useChatViewScroll = ({
  currentChatId,
  interactionState,
  messagesListRef,
  renderableMessages,
  rowVirtualizer,
}: UseChatViewScrollArgs) => {
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const userHasScrolledUpRef = useRef(false);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesListRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottomThreshold = 5;
    const atBottom = distanceFromBottom < nearBottomThreshold;
    setShowScrollToBottom(!atBottom);
    const significantScrollThreshold = 100;
    if (distanceFromBottom > significantScrollThreshold) {
      userHasScrolledUpRef.current = true;
    } else if (atBottom) {
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

  const resetUserScroll = useCallback(() => {
    userHasScrolledUpRef.current = false;
  }, []);

  useEffect(() => {
    const handleMessageNavigation = (event: Event) => {
      const customEvent = event as CustomEvent<{ messageId: string }>;
      const messageId = customEvent.detail?.messageId;

      if (!messageId) {
        console.error("No messageId provided for navigation");
        return;
      }

      const targetIndex = renderableMessages.findIndex(
        (item) => item.message?.id === messageId || item.id === messageId,
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
      handleMessageNavigation as EventListener,
    );
    return () => {
      window.removeEventListener(
        "navigate-to-message",
        handleMessageNavigation as EventListener,
      );
    };
  }, [renderableMessages, rowVirtualizer]);

  const previousStateRef = useRef(interactionState.value);
  useEffect(() => {
    const currentState = interactionState.value;
    const previousState = previousStateRef.current;

    if (previousState === "IDLE" && currentState === "THINKING") {
      resetUserScroll();
      scrollToBottom();
    }

    previousStateRef.current = currentState;
  }, [interactionState.value, resetUserScroll, scrollToBottom]);

  useEffect(() => {
    return streamingMessageBus.subscribe((update) => {
      if (update.chatId !== currentChatId) return;
      if (userHasScrolledUpRef.current) return;
      if (!update.content) return;
      scrollToBottom();
    });
  }, [currentChatId, scrollToBottom]);

  useEffect(() => {
    if (!userHasScrolledUpRef.current && renderableMessages.length > 0) {
      scrollToBottom();
    }
  }, [renderableMessages.length, scrollToBottom]);

  return {
    handleMessagesScroll,
    resetUserScroll,
    scrollToBottom,
    showScrollToBottom,
  };
};
