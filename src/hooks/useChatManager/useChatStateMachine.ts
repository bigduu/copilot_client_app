import { useCallback, useMemo } from "react";
import type { Message, UserFileReferenceMessage } from "../../types/chat";
import type { UseChatState } from "./types";

type ChatMachineEvent = { type: "CANCEL" };

export interface UseChatStateMachine {
  interactionState: {
    value: "IDLE" | "THINKING" | "AWAITING_APPROVAL";
    context: {
      streamingContent: string | null;
      toolCallRequest: null;
      parsedParameters: null;
    };
    matches: (state: "IDLE" | "THINKING" | "AWAITING_APPROVAL") => boolean;
  };
  currentMessages: Message[];
  pendingAgentApproval: null;
  send: (event: ChatMachineEvent) => void;
  setPendingAgentApproval: (approval: any | null) => void;
  retryLastMessage: () => Promise<void>;
}

export function useChatStateMachine(
  state: UseChatState,
  options?: {
    onCancel?: () => void;
    onRetry?: (content: string) => Promise<void>;
    isProcessing?: boolean;
  },
): UseChatStateMachine {
  const isProcessing = options?.isProcessing ?? false;
  const currentMessages = useMemo(
    () => state.baseMessages,
    [state.baseMessages],
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

  const send = useCallback(
    (event: ChatMachineEvent) => {
      if (event.type === "CANCEL") {
        options?.onCancel?.();
      }
    },
    [options],
  );

  const retryLastMessage = useCallback(async () => {
    if (!state.currentChatId || !state.currentChat) return;
    const history = [...state.baseMessages];
    if (history.length === 0) return;

    const lastMessage = history[history.length - 1];
    let trimmedHistory = history;
    if (lastMessage?.role === "assistant") {
      state.deleteMessage(state.currentChatId, lastMessage.id);
      trimmedHistory = history.slice(0, -1);
    }

    const lastUser = [...trimmedHistory]
      .reverse()
      .find((msg) => msg.role === "user");
    if (!lastUser) return;

    const content =
      "content" in lastUser
        ? lastUser.content
        : (lastUser as UserFileReferenceMessage).displayText;

    if (typeof content !== "string") return;
    await options?.onRetry?.(content);
  }, [
    options,
    state.baseMessages,
    state.currentChat,
    state.currentChatId,
    state.deleteMessage,
  ]);

  return {
    interactionState,
    currentMessages,
    pendingAgentApproval: null,
    send,
    setPendingAgentApproval: () => {},
    retryLastMessage,
  };
}
