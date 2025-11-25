import { useCallback, useEffect, useRef, useState } from "react";

interface UseScrollManagementProps {
  messagesCount: number;
  interactionState: any;
  currentContextId?: string | null;
}

/**
 * Hook to manage scroll behavior in ChatView
 * Handles auto-scroll, scroll-to-bottom button, and user scroll tracking
 */
export const useScrollManagement = ({
  messagesCount,
  interactionState,
  currentContextId,
}: UseScrollManagementProps) => {
  const messagesListRef = useRef<HTMLDivElement>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const userHasScrolledUpRef = useRef(false);
  const previousStateRef = useRef(interactionState.value);
  const lastContextIdRef = useRef<string | null>(null);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesListRef.current;
    if (!el) return;

    const scrollTop = el.scrollTop;
    const scrollHeight = el.scrollHeight;
    const clientHeight = el.clientHeight;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);

    const threshold = 150;
    const isNearBottom = distanceFromBottom < threshold;

    setShowScrollToBottom(!isNearBottom);
    userHasScrolledUpRef.current = !isNearBottom ? false : true;

    if (isNearBottom) {
      userHasScrolledUpRef.current = false;
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    if (messagesCount === 0) return;

    requestAnimationFrame(() => {
      messagesListRef.current?.scrollTo({
        top: messagesListRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, [messagesCount]);

  // Reset scroll flag and scroll to bottom when user sends a message
  useEffect(() => {
    const currentState = interactionState.value;
    const previousState = previousStateRef.current;

    if (previousState === "idle" && currentState === "thinking") {
      userHasScrolledUpRef.current = false;
      scrollToBottom();
    }

    previousStateRef.current = currentState;
  }, [interactionState.value, scrollToBottom]);

  // Auto-scroll to bottom when streaming content updates
  useEffect(() => {
    if (
      !userHasScrolledUpRef.current &&
      interactionState.context.streamingContent
    ) {
      scrollToBottom();
    }
  }, [scrollToBottom, interactionState.context.streamingContent]);

  // Auto-scroll when new messages are added
  useEffect(() => {
    if (!userHasScrolledUpRef.current && messagesCount > 0) {
      scrollToBottom();
    }
  }, [messagesCount, scrollToBottom]);

  // Reset scroll flag when chat context changes
  useEffect(() => {
    if (currentContextId !== lastContextIdRef.current) {
      lastContextIdRef.current = currentContextId || null;
      userHasScrolledUpRef.current = false;
      scrollToBottom();
    }
  }, [currentContextId, scrollToBottom]);

  return {
    messagesListRef,
    showScrollToBottom,
    handleMessagesScroll,
    scrollToBottom,
  };
};
