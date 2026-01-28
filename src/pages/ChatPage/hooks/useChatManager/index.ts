/**
 * Main useChatManager hook - Orchestrator
 *
 * This hook composes all sub-hooks to provide a unified interface
 * for chat management. It follows the composition pattern to keep
 * each hook focused on a single responsibility.
 */

import { useEffect, useRef } from "react";
import { useChatState } from "./useChatState";
import { useChatTitleGeneration } from "./useChatTitleGeneration";
import { useChatOperations } from "./useChatOperations";
import { useChatStateMachine } from "./useChatStateMachine";
import { useChatOpenAIStreaming } from "./useChatOpenAIStreaming";

/**
 * Unified hook for managing all chat-related state and interactions.
 * This hook is the single source of truth for chat management in the UI.
 *
 * Uses OpenAI streaming with a local streaming component.
 */
export const useChatManager = () => {
  // Phase 1: State and derived values
  const state = useChatState();

  // Phase 2: Title generation
  const titleGeneration = useChatTitleGeneration(state);

  // Phase 3: Chat operations (CRUD)
  const operations = useChatOperations(state);

  const streaming = useChatOpenAIStreaming({
    currentChat: state.currentChat,
    addMessage: state.addMessage,
    setProcessing: state.setProcessing,
  });

  const stateMachine = useChatStateMachine(state, {
    onCancel: streaming.cancel,
    onRetry: streaming.sendMessage,
    isProcessing: state.isProcessing,
  });

  const lastAutoTitleMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!state.currentChatId) return;
    const messages = state.baseMessages;
    if (messages.length === 0) return;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== "assistant") return;
    if (lastMessage.id === lastAutoTitleMessageIdRef.current) return;
    lastAutoTitleMessageIdRef.current = lastMessage.id;
    titleGeneration.generateChatTitle(state.currentChatId).catch((error) => {
      console.warn("Auto title generation failed:", error);
    });
  }, [
    state.baseMessages,
    state.currentChatId,
    titleGeneration.generateChatTitle,
  ]);

  // Compose and return the complete interface
  return {
    // State from useChatState
    chats: state.chats,
    currentChatId: state.currentChatId,
    currentChat: state.currentChat,
    pinnedChats: state.pinnedChats,
    unpinnedChats: state.unpinnedChats,
    chatCount: state.chatCount,

    // State from useChatStateMachine (overrides baseMessages with currentMessages)
    currentMessages: stateMachine.currentMessages,
    interactionState: stateMachine.interactionState,
    pendingAgentApproval: stateMachine.pendingAgentApproval,

    // State from useChatTitleGeneration
    titleGenerationState: titleGeneration.titleGenerationState,
    autoGenerateTitles: titleGeneration.autoGenerateTitles,
    isUpdatingAutoTitlePreference:
      titleGeneration.isUpdatingAutoTitlePreference,

    // Actions from useChatState
    addMessage: state.addMessage,
    deleteMessage: state.deleteMessage,
    selectChat: state.selectChat,
    deleteChat: state.deleteChat,
    deleteChats: state.deleteChats,
    pinChat: state.pinChat,
    unpinChat: state.unpinChat,
    updateChat: state.updateChat,
    loadChats: state.loadChats,

    // Actions from useChatTitleGeneration
    generateChatTitle: titleGeneration.generateChatTitle,
    setAutoGenerateTitlesPreference:
      titleGeneration.setAutoGenerateTitlesPreference,

    // Actions from useChatOperations
    createNewChat: operations.createNewChat,
    createChatWithSystemPrompt: operations.createChatWithSystemPrompt,
    toggleChatPin: operations.toggleChatPin,
    updateChatTitle: operations.updateChatTitle,
    deleteEmptyChats: operations.deleteEmptyChats,
    deleteAllUnpinnedChats: operations.deleteAllUnpinnedChats,

    // Actions from useChatStateMachine
    send: stateMachine.send,
    setPendingAgentApproval: stateMachine.setPendingAgentApproval,
    retryLastMessage: stateMachine.retryLastMessage,

    // Actions from useChatOpenAIStreaming
    sendMessage: streaming.sendMessage,
    cancelMessage: streaming.cancel,
  };
};
