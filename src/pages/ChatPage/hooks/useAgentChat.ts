import { useCallback, useRef } from "react";
import { AgentClient, AgentEventHandlers, AgentEvent } from "../services/AgentService";
import { streamingMessageBus } from "../utils/streamingMessageBus";

interface UseAgentChatParams {
  chatId: string;
  addMessage: (chatId: string, message: any) => Promise<void>;
}

interface UseAgentChatReturn {
  sendMessage: (message: string, sessionId?: string) => Promise<void>;
  stopGeneration: () => void;
  isStreaming: () => boolean;
}

/**
 * Hook for chatting with local Agent Server
 * Replaces direct OpenAI calls with Agent-based multi-turn tool execution
 */
export const useAgentChat = ({
  chatId,
  addMessage,
}: UseAgentChatParams): UseAgentChatReturn => {
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const streamingContentRef = useRef<string>("");
  const clientRef = useRef(new AgentClient());

  const sendMessage = useCallback(
    async (message: string, sessionId?: string) => {
      // Create abort controller for this request
      abortControllerRef.current = new AbortController();

      try {
        // Step 1: Send message to Agent Server
        const response = await clientRef.current.sendMessage({
          message,
          session_id: sessionId,
        });

        const { session_id } = response;

        // Step 2: Setup streaming message
        const streamingMessageId = `streaming-${chatId}`;
        streamingMessageIdRef.current = streamingMessageId;
        streamingContentRef.current = "";
        
        streamingMessageBus.publish({
          chatId,
          messageId: streamingMessageId,
          content: "",
        });

        // Track tool calls for this streaming session
        const toolCallsInProgress = new Map<string, {
          name: string;
          args: Record<string, unknown>;
        }>();

        // Step 3: Stream events from Agent Server
        const handlers: AgentEventHandlers = {
          onToken: (content: string) => {
            streamingContentRef.current += content;
            streamingMessageBus.publish({
              chatId,
              messageId: streamingMessageId,
              content: streamingContentRef.current,
            });
          },

          onToolStart: (toolCallId: string, toolName: string, args: Record<string, unknown>) => {
            toolCallsInProgress.set(toolCallId, { name: toolName, args });
            
            // Add tool call indicator to streaming content
            const toolIndicator = `\n\n🔧 **Using tool**: ${toolName}\n`;
            streamingContentRef.current += toolIndicator;
            streamingMessageBus.publish({
              chatId,
              messageId: streamingMessageId,
              content: streamingContentRef.current,
            });
          },

          onToolComplete: (toolCallId: string, result: AgentEvent["result"]) => {
            const toolCall = toolCallsInProgress.get(toolCallId);
            if (toolCall) {
              toolCallsInProgress.delete(toolCallId);
              
              // Add tool result indicator
              const successIcon = result?.success ? "✅" : "❌";
              const resultPreview = result?.result?.substring(0, 200) || "";
              const resultIndicator = `${successIcon} **Result**: \`\`\`\n${resultPreview}\n\`\`\`\n\n`;
              
              streamingContentRef.current += resultIndicator;
              streamingMessageBus.publish({
                chatId,
                messageId: streamingMessageId,
                content: streamingContentRef.current,
              });
            }
          },

          onToolError: (toolCallId: string, error: string) => {
            toolCallsInProgress.delete(toolCallId);
            
            const errorIndicator = `\n\n❌ **Tool Error**: ${error}\n\n`;
            streamingContentRef.current += errorIndicator;
            streamingMessageBus.publish({
              chatId,
              messageId: streamingMessageId,
              content: streamingContentRef.current,
            });
          },

          onComplete: async () => {
            // Save the final message
            if (streamingContentRef.current) {
              await addMessage(chatId, {
                id: `assistant-${Date.now()}`,
                role: "assistant",
                content: streamingContentRef.current,
                createdAt: new Date().toISOString(),
                metadata: {
                  sessionId: session_id,
                  model: "agent",
                },
              });
            }
            
            // Clear streaming state
            streamingMessageIdRef.current = null;
            streamingContentRef.current = "";
          },

          onError: async (errorMessage: string) => {
            console.error("Agent error:", errorMessage);
            
            // Add error message
            await addMessage(chatId, {
              id: `error-${Date.now()}`,
              role: "assistant",
              content: `❌ **Error**: ${errorMessage}`,
              createdAt: new Date().toISOString(),
              isError: true,
            });
            
            streamingMessageIdRef.current = null;
            streamingContentRef.current = "";
          },
        };

        // Start streaming
        await clientRef.current.streamEvents(
          session_id,
          handlers,
          abortControllerRef.current
        );

      } catch (error) {
        console.error("Failed to send message:", error);
        
        await addMessage(chatId, {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: `❌ **Error**: ${error instanceof Error ? error.message : "Unknown error"}`,
          createdAt: new Date().toISOString(),
          isError: true,
        });
        
        streamingMessageIdRef.current = null;
      }
    },
    [chatId, addMessage]
  );

  const stopGeneration = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      
      // Also tell the server to stop
      try {
        const streamingId = streamingMessageIdRef.current;
        if (streamingId) {
          // Extract session ID from streaming ID if needed
          // For now, just abort locally
        }
      } catch (e) {
        console.warn("Failed to stop generation on server:", e);
      }
    }
  }, []);

  const isStreaming = useCallback(() => {
    return streamingMessageIdRef.current !== null;
  }, []);

  return {
    sendMessage,
    stopGeneration,
    isStreaming,
  };
};
