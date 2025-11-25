import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMachine } from "@xstate/react";
import { chatMachine, ChatMachineEvent } from "../../core/chatInteractionMachine";
import type { AssistantTextMessage, ChatItem, Message } from "../../types/chat";
import type { UseChatState } from "./types";

/**
 * Hook for XState chat machine integration
 * Handles streaming state and state machine transitions
 */
export interface UseChatStateMachine {
  interactionState: any;
  currentMessages: Message[];
  pendingAgentApproval: {
    request_id: string;
    session_id: string;
    tool: string;
    tool_description: string;
    parameters: Record<string, any>;
  } | null;
  send: (event: ChatMachineEvent) => void;
  setPendingAgentApproval: (approval: any | null) => void;
  retryLastMessage: () => Promise<void>;
}

export function useChatStateMachine(
  state: UseChatState
): UseChatStateMachine {
  // --- LOCAL UI STATE FOR STREAMING ---
  const [streamingText, setStreamingText] = useState("");
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null
  );

  // --- AGENT APPROVAL STATE ---
  const [pendingAgentApproval, setPendingAgentApproval] = useState<{
    request_id: string;
    session_id: string;
    tool: string;
    tool_description: string;
    parameters: Record<string, any>;
  } | null>(null);

  // --- CHAT INTERACTION STATE MACHINE ---
  const providedChatMachine = useMemo(() => {
    return chatMachine.provide({
      actions: {
        forwardChunkToUI: ({ event }: { event: ChatMachineEvent }) => {
          if (event.type === "CHUNK_RECEIVED") {
            setStreamingText((prev) => prev + event.payload.chunk);
          }
        },
        finalizeStreamingMessage: async ({
          event,
        }: {
          event: ChatMachineEvent;
        }) => {
          if (
            event.type === "STREAM_COMPLETE_TEXT" &&
            streamingMessageId &&
            state.currentChatId
          ) {
            await state.updateMessageContent(
              state.currentChatId,
              streamingMessageId,
              event.payload.finalContent
            );
            // Reset local streaming UI state
            setStreamingMessageId(null);
            setStreamingText("");
          }
        },
      },
    });
  }, []); // ✅ Initialize once on mount

  const [machineState, send] = useMachine(providedChatMachine);
  const prevStateRef = useRef(machineState);
  const prevChatIdRef = useRef<string | null>(null);

  // --- FINAL MESSAGES FOR UI ---
  const currentMessages = useMemo(() => {
    if (!streamingMessageId) {
      return state.baseMessages;
    }
    // Ensure the streaming message placeholder is part of the list
    const messageExists = state.baseMessages.some(
      (msg) => msg.id === streamingMessageId
    );
    const list = messageExists
      ? state.baseMessages
      : [
          ...state.baseMessages,
          {
            id: streamingMessageId,
            role: "assistant",
            type: "text",
            content: "",
            createdAt: new Date().toISOString(),
          } as AssistantTextMessage,
        ];

    return list.map((msg) =>
      msg.id === streamingMessageId ? { ...msg, content: streamingText } : msg
    );
  }, [state.baseMessages, streamingMessageId, streamingText]);

  // Reset state machine when chat changes
  useEffect(() => {
    if (
      prevChatIdRef.current &&
      prevChatIdRef.current !== state.currentChatId
    ) {
      send({ type: "CANCEL" });
      setStreamingMessageId(null);
      setStreamingText("");
    }
    prevChatIdRef.current = state.currentChatId;
  }, [state.currentChatId, send]);

  // Handle side-effects based on state transitions
  useEffect(() => {
    if (!state.currentChatId) return;

    const prevState = prevStateRef.current;

    if (machineState.value === prevState.value) {
      return;
    }

    console.log(
      `[useChatStateMachine] State changed from ${JSON.stringify(
        prevState.value
      )} to ${JSON.stringify(machineState.value)}`
    );

    // --- Handle entering THINKING state ---
    if (
      machineState.matches("THINKING") &&
      !prevState.matches("THINKING")
    ) {
      const newStreamingMessage: AssistantTextMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        type: "text",
        content: "",
        createdAt: new Date().toISOString(),
      };
      state.addMessage(state.currentChatId, newStreamingMessage);
      setStreamingMessageId(newStreamingMessage.id);
      setStreamingText("");
    }

    // --- Sync message list on other state changes ---
    if (
      machineState.context.messages.length !== prevState.context.messages.length
    ) {
      state.setMessages(state.currentChatId, machineState.context.messages);
    }

    prevStateRef.current = machineState;
  }, [machineState, state]);

  const retryLastMessage = useCallback(async () => {
    if (!state.currentChat) return;

    const history = [...state.baseMessages];
    if (history.length === 0) return;

    const lastMessage = history[history.length - 1];
    let messagesToRetry = history;

    if (lastMessage?.role === "assistant") {
      state.deleteMessage(state.currentChat.id, lastMessage.id);
      messagesToRetry = history.slice(0, -1);
    }

    if (messagesToRetry.length > 0) {
      const updatedChat: ChatItem = {
        ...state.currentChat,
        messages: messagesToRetry,
      };
      send({
        type: "USER_SUBMITS",
        payload: {
          messages: messagesToRetry,
          chat: updatedChat,
          systemPrompts: [], // TODO: Get from store if needed
        },
      });
    }
  }, [state, send]);

  return {
    interactionState: machineState,
    currentMessages,
    pendingAgentApproval,
    send,
    setPendingAgentApproval,
    retryLastMessage,
  };
}
