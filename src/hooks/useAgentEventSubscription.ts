import { useEffect, useRef } from 'react';
import { AgentClient, TokenBudgetUsage, ContextSummaryInfo } from '../services/chat/AgentService';
import { useAppStore } from '../pages/ChatPage/store';
import { streamingMessageBus } from '../pages/ChatPage/utils/streamingMessageBus';
import { message } from 'antd';

/**
 * Hook to maintain a persistent subscription to agent events for the current chat
 * This ensures messages stream in real-time even after clarification responses
 */
export function useAgentEventSubscription() {
  const currentChat = useAppStore((state) =>
    state.chats.find((chat) => chat.id === state.currentChatId) || null
  );
  const addMessage = useAppStore((state) => state.addMessage);
  const isProcessing = useAppStore((state) => state.isProcessing);
  const setProcessing = useAppStore((state) => state.setProcessing);
  const updateTokenUsage = useAppStore((state) => state.updateTokenUsage);
  const setTruncationInfo = useAppStore((state) => state.setTruncationInfo);
  const updateChat = useAppStore((state) => state.updateChat);

  const agentClientRef = useRef(new AgentClient());
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const streamingContentRef = useRef<string>('');

  // Initialize token usage from chat config (for page refresh recovery)
  useEffect(() => {
    const chatId = currentChat?.id;
    const configTokenUsage = currentChat?.config?.tokenUsage;
    const configTruncation = currentChat?.config?.truncationOccurred;
    const configSegments = currentChat?.config?.segmentsRemoved;

    if (chatId && configTokenUsage) {
      updateTokenUsage(chatId, configTokenUsage);
      if (configTruncation !== undefined && configSegments !== undefined) {
        setTruncationInfo(chatId, configTruncation, configSegments);
      }
    }
  }, [currentChat?.id, currentChat?.config?.tokenUsage, updateTokenUsage, setTruncationInfo]);

  useEffect(() => {
    const agentSessionId = currentChat?.config?.agentSessionId;
    const chatId = currentChat?.id;

    // Only subscribe if we have an active session and processing is happening
    if (!agentSessionId || !chatId || !isProcessing) {
      // Clean up any existing subscription
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      return;
    }

    // Don't create duplicate subscription if one already exists
    if (abortControllerRef.current) {
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const streamingMessageId = `streaming-${chatId}`;
    streamingMessageIdRef.current = streamingMessageId;
    streamingContentRef.current = '';

    // Initialize streaming message
    streamingMessageBus.publish({
      chatId,
      messageId: streamingMessageId,
      content: '',
    });

    // Track tool calls in progress
    const toolCallsInProgress = new Map<
      string,
      { name: string; args: Record<string, unknown> }
    >();

    console.log('[useAgentEventSubscription] Starting subscription for session:', agentSessionId);

    // Subscribe to events
    agentClientRef.current.subscribeToEvents(
      agentSessionId,
      {
        onToken: (tokenContent: string) => {
          streamingContentRef.current += tokenContent;
          streamingMessageBus.publish({
            chatId,
            messageId: streamingMessageId,
            content: streamingContentRef.current,
          });
        },

        onToolStart: (
          toolCallId: string,
          toolName: string,
          args: Record<string, unknown>,
        ) => {
          toolCallsInProgress.set(toolCallId, { name: toolName, args });

          void addMessage(chatId, {
            id: crypto.randomUUID(),
            role: 'assistant',
            type: 'tool_call',
            toolCalls: [
              {
                toolCallId,
                toolName,
                parameters: args || {},
              },
            ],
            createdAt: new Date().toISOString(),
          });
        },

        onToolComplete: (toolCallId: string, result: any) => {
          const toolCall = toolCallsInProgress.get(toolCallId);
          toolCallsInProgress.delete(toolCallId);

          const toolName = toolCall?.name || result?.tool_name || 'unknown';
          const displayPreference = result?.display_preference || 'Default';

          void addMessage(chatId, {
            id: crypto.randomUUID(),
            role: 'assistant',
            type: 'tool_result',
            toolName,
            toolCallId,
            result: {
              tool_name: toolName,
              result: result?.result ?? '',
              display_preference: displayPreference,
            },
            isError: !result?.success,
            createdAt: new Date().toISOString(),
          });
        },

        onToolError: (toolCallId: string, error: string) => {
          const toolCall = toolCallsInProgress.get(toolCallId);
          toolCallsInProgress.delete(toolCallId);

          const toolName = toolCall?.name || 'unknown';

          void addMessage(chatId, {
            id: crypto.randomUUID(),
            role: 'assistant',
            type: 'tool_result',
            toolName,
            toolCallId,
            result: {
              tool_name: toolName,
              result: error,
              display_preference: 'Default',
            },
            isError: true,
            createdAt: new Date().toISOString(),
          });
        },

        onTokenBudgetUpdated: (usage: TokenBudgetUsage) => {
          console.log('[useAgentEventSubscription] Token budget updated:', usage);

          const tokenUsage = {
            systemTokens: usage.system_tokens,
            summaryTokens: usage.summary_tokens,
            windowTokens: usage.window_tokens,
            totalTokens: usage.total_tokens,
            budgetLimit: usage.budget_limit,
          };

          // Update token usage in store (for real-time display)
          updateTokenUsage(chatId, tokenUsage);

          // Update truncation info in store
          setTruncationInfo(chatId, usage.truncation_occurred, usage.segments_removed);

          // Persist to chat config (for page refresh recovery)
          // Note: This will cause a re-render but should NOT cause re-subscription
          // because currentChat?.config?.agentSessionId hasn't changed
          updateChat(chatId, {
            config: {
              ...currentChat?.config,
              tokenUsage,
              truncationOccurred: usage.truncation_occurred,
              segmentsRemoved: usage.segments_removed,
            },
          });
        },

        onContextSummarized: (summaryInfo: ContextSummaryInfo) => {
          console.log('[useAgentEventSubscription] Context summarized:', summaryInfo);

          // Show notification to user
          message.info(
            `Conversation summarized: ${summaryInfo.messages_summarized} messages compressed, ` +
            `saved ${summaryInfo.tokens_saved.toLocaleString()} tokens`,
            5
          );
        },

        onComplete: async () => {
          console.log('[useAgentEventSubscription] Agent execution completed');

          // Save final assistant message if there's content
          if (streamingContentRef.current) {
            await addMessage(chatId, {
              id: `assistant-${Date.now()}`,
              role: 'assistant',
              type: 'text',
              content: streamingContentRef.current,
              createdAt: new Date().toISOString(),
              metadata: {
                sessionId: agentSessionId,
                model: 'agent',
              },
            });
          }

          // Clean up streaming state
          streamingMessageBus.clear(chatId, streamingMessageId);
          streamingMessageIdRef.current = null;
          streamingContentRef.current = '';
          abortControllerRef.current = null;  // Clear ref to allow re-subscription
          setProcessing(false);
        },

        onError: async (errorMessage: string) => {
          console.error('[useAgentEventSubscription] Agent error:', errorMessage);

          await addMessage(chatId, {
            id: `error-${Date.now()}`,
            role: 'assistant',
            type: 'text',
            content: `❌ **Error**: ${errorMessage}`,
            createdAt: new Date().toISOString(),
            finishReason: 'error',
          });

          // Clean up streaming state
          streamingMessageBus.clear(chatId, streamingMessageId);
          streamingMessageIdRef.current = null;
          streamingContentRef.current = '';
          abortControllerRef.current = null;  // Clear ref to allow re-subscription
          setProcessing(false);
        },
      },
      controller,
    ).catch((error) => {
      if ((error as any).name !== 'AbortError') {
        console.error('[useAgentEventSubscription] Subscription error:', error);
        // Clear ref to allow retry
        abortControllerRef.current = null;
        // Reset processing state so user can retry
        setProcessing(false);
      }
    });

    return () => {
      console.log('[useAgentEventSubscription] Cleaning up subscription');
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (streamingMessageIdRef.current && chatId) {
        streamingMessageBus.clear(chatId, streamingMessageIdRef.current);
      }
      streamingMessageIdRef.current = null;
      streamingContentRef.current = '';
    };
  }, [
    currentChat?.config?.agentSessionId,
    currentChat?.id,
    isProcessing,
    addMessage,
    setProcessing,
    updateTokenUsage,
    setTruncationInfo,
    // Note: We intentionally exclude currentChat?.config and updateChat from dependencies
    // because updateChat updates config, which would cause infinite re-subscription
  ]);
}
