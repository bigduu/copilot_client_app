import { useCallback, useEffect, useRef, useState } from "react";
import { App as AntApp } from "antd";
import { AgentClient } from "../../services/AgentService";
import type { UserMessage } from "../../types/chat";
import type { ImageFile } from "../../utils/imageUtils";
import { streamingMessageBus } from "../../utils/streamingMessageBus";

export interface UseChatStreaming {
  sendMessage: (content: string, images?: ImageFile[]) => Promise<void>;
  cancel: () => void;
  agentAvailable: boolean | null;
}

interface UseChatStreamingDeps {
  currentChat: any | null;
  addMessage: (chatId: string, message: any) => Promise<void>;
  setProcessing: (isProcessing: boolean) => void;
  updateChat: (chatId: string, updates: any) => void;
}

/**
 * Unified chat streaming hook
 *
 * Agent-only flow using the local agent endpoints (localhost:8080).
 */
export function useChatStreaming(
  deps: UseChatStreamingDeps,
): UseChatStreaming {
  const { modal, message: appMessage } = AntApp.useApp();
  const abortRef = useRef<AbortController | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const streamingContentRef = useRef<string>("");
  const agentClientRef = useRef(new AgentClient());
  
  // Track Agent availability
  const [agentAvailable, setAgentAvailable] = useState<boolean | null>(null);
  const lastAgentAvailableRef = useRef<boolean | null>(null);

  // Check Agent availability on mount
  useEffect(() => {
    const checkAgent = async () => {
      try {
        const available = await agentClientRef.current.healthCheck();
        setAgentAvailable(available);
        if (lastAgentAvailableRef.current && !available) {
          appMessage.warning("Agent unavailable");
        }
        lastAgentAvailableRef.current = available;
        console.log(`[useChatStreaming] Agent Server ${available ? "available" : "not available"}`);
      } catch (error) {
        setAgentAvailable(false);
        if (lastAgentAvailableRef.current) {
          appMessage.warning("Agent unavailable");
        }
        lastAgentAvailableRef.current = false;
        console.warn("[useChatStreaming] Agent health check failed:", error);
      }
    };
    checkAgent();
    const interval = setInterval(checkAgent, 10000);
    return () => clearInterval(interval);
  }, [appMessage]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const resolveDisplayPreference = (value?: string) => {
    if (value === "Hidden") return "Hidden";
    if (value === "Collapsible") return "Collapsible";
    return "Default";
  };

  /**
   * Send message using Agent Server
   */
  const sendWithAgent = useCallback(
    async (content: string, chatId: string, _userMessage: UserMessage) => {
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        // Step 1: Send message to Agent
        const response = await agentClientRef.current.sendMessage({
          message: content,
          session_id: deps.currentChat?.config?.agentSessionId,
        });

        const { session_id } = response;
        const currentConfig = deps.currentChat?.config;
        if (currentConfig && currentConfig.agentSessionId !== session_id) {
          deps.updateChat(chatId, {
            config: {
              ...currentConfig,
              agentSessionId: session_id,
            },
          });
        }

        // Step 2: Setup streaming
        const streamingMessageId = `streaming-${chatId}`;
        streamingMessageIdRef.current = streamingMessageId;
        streamingContentRef.current = "";
        
        streamingMessageBus.publish({
          chatId,
          messageId: streamingMessageId,
          content: "",
        });

        // Track tool calls
        const toolCallsInProgress = new Map<
          string,
          { name: string; args: Record<string, unknown> }
        >();

        // Step 3: Stream events
        await agentClientRef.current.streamEvents(
          session_id,
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

              void deps.addMessage(chatId, {
                id: crypto.randomUUID(),
                role: "assistant",
                type: "tool_call",
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

              const toolName = toolCall?.name || result?.tool_name || "unknown";
              const displayPreference = resolveDisplayPreference(
                result?.display_preference,
              );

              void deps.addMessage(chatId, {
                id: crypto.randomUUID(),
                role: "assistant",
                type: "tool_result",
                toolName,
                toolCallId,
                result: {
                  tool_name: toolName,
                  result: result?.result ?? "",
                  display_preference: displayPreference,
                },
                isError: !result?.success,
                createdAt: new Date().toISOString(),
              });
            },

            onToolError: (toolCallId: string, error: string) => {
              const toolCall = toolCallsInProgress.get(toolCallId);
              toolCallsInProgress.delete(toolCallId);

              const toolName = toolCall?.name || "unknown";

              void deps.addMessage(chatId, {
                id: crypto.randomUUID(),
                role: "assistant",
                type: "tool_result",
                toolName,
                toolCallId,
                result: {
                  tool_name: toolName,
                  result: error,
                  display_preference: "Default",
                },
                isError: true,
                createdAt: new Date().toISOString(),
              });
            },

            onComplete: async () => {
              if (streamingContentRef.current) {
                await deps.addMessage(chatId, {
                  id: `assistant-${Date.now()}`,
                  role: "assistant",
                  type: "text",
                  content: streamingContentRef.current,
                  createdAt: new Date().toISOString(),
                  metadata: {
                    sessionId: session_id,
                    model: "agent",
                  },
                });
              }
              streamingMessageBus.clear(chatId, streamingMessageId);
              streamingMessageIdRef.current = null;
              streamingContentRef.current = "";
              deps.setProcessing(false);
            },

            onError: async (errorMessage: string) => {
              console.error("Agent error:", errorMessage);
              
              await deps.addMessage(chatId, {
                id: `error-${Date.now()}`,
                role: "assistant",
                type: "text",
                content: `❌ **Error**: ${errorMessage}`,
                createdAt: new Date().toISOString(),
                isError: true,
              });
              streamingMessageBus.clear(chatId, streamingMessageId);
              streamingMessageIdRef.current = null;
              streamingContentRef.current = "";
              deps.setProcessing(false);
            },
          },
          controller
        );

      } catch (error) {
        throw error; // Re-throw to trigger fallback
      }
    },
    [deps]
  );

  const sendMessage = useCallback(
    async (content: string, images?: ImageFile[]) => {
      if (!deps.currentChat) {
        modal.info({
          title: "No Active Chat",
          content: "Please create or select a chat before sending a message.",
        });
        return;
      }

      if (agentAvailable === false) {
        appMessage.error("Agent unavailable. Please try again later.");
        return;
      }

      const chatId = deps.currentChat.id;
      const messageImages =
        images?.map((img) => ({
          id: img.id,
          base64: img.base64,
          name: img.name,
          size: img.size,
          type: img.type,
        })) || [];

      const userMessage: UserMessage = {
        role: "user",
        content,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        images: messageImages,
      };

      await deps.addMessage(chatId, userMessage);

      deps.setProcessing(true);

      try {
        console.log("[useChatStreaming] Using Agent Server");
        await sendWithAgent(content, chatId, userMessage);
      } catch (error) {
        if (streamingMessageIdRef.current) {
          streamingMessageBus.clear(chatId, streamingMessageIdRef.current);
        }
        streamingMessageIdRef.current = null;
        streamingContentRef.current = "";
        
        if ((error as any).name === "AbortError") {
          appMessage.info("Request cancelled");
        } else {
          console.error("[useChatStreaming] Failed to send message:", error);
          appMessage.error("Failed to send message. Please try again.");
          setAgentAvailable(false);
        }
      } finally {
        abortRef.current = null;
        if (streamingMessageIdRef.current) {
          streamingMessageBus.clear(chatId, streamingMessageIdRef.current);
        }
        streamingMessageIdRef.current = null;
        streamingContentRef.current = "";
        deps.setProcessing(false);
      }
    },
    [deps, modal, appMessage, agentAvailable, sendWithAgent]
  );

  return {
    sendMessage,
    cancel,
    agentAvailable,
  };
}
