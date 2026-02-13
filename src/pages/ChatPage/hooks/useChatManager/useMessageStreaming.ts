import { useCallback, useEffect, useRef } from "react";
import { App as AntApp } from "antd";
import { AgentClient } from "../../services/AgentService";
import type { UserMessage } from "../../types/chat";
import type { ImageFile } from "../../utils/imageUtils";
import { streamingMessageBus } from "../../utils/streamingMessageBus";
import { useAppStore } from "../../store";
import { getSystemPromptEnhancementText } from "../../../../shared/utils/systemPromptEnhancement";

export interface UseMessageStreaming {
  sendMessage: (content: string, images?: ImageFile[]) => Promise<void>;
  cancel: () => void;
  agentAvailable: boolean | null;
}

interface UseMessageStreamingDeps {
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
export function useMessageStreaming(deps: UseMessageStreamingDeps): UseMessageStreaming {
  const { modal, message: appMessage } = AntApp.useApp();
  const abortRef = useRef<AbortController | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const streamingContentRef = useRef<string>("");
  const agentClientRef = useRef(new AgentClient());

  const agentAvailable = useAppStore((state) => state.agentAvailability);
  const setAgentAvailability = useAppStore(
    (state) => state.setAgentAvailability,
  );
  const checkAgentAvailability = useAppStore(
    (state) => state.checkAgentAvailability,
  );
  const startAgentHealthCheck = useAppStore(
    (state) => state.startAgentHealthCheck,
  );
  const selectedModel = useAppStore((state) => state.selectedModel);

  useEffect(() => {
    startAgentHealthCheck();
  }, [startAgentHealthCheck]);

  const cancel = useCallback(() => {
    // Abort local streaming
    abortRef.current?.abort();

    // Also tell backend to stop agent execution
    const sessionId = deps.currentChat?.config?.agentSessionId;
    if (sessionId) {
      agentClientRef.current.stopGeneration(sessionId).catch((error) => {
        console.error('[useMessageStreaming] Failed to stop generation:', error);
      });
    }
  }, [deps.currentChat?.config?.agentSessionId]);

  /**
   * Send message using Agent Server
   * Note: Event subscription is handled by useAgentEventSubscription hook in ChatView
   */
  const sendWithAgent = useCallback(
    async (content: string, chatId: string, _userMessage: UserMessage) => {
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const baseSystemPrompt = (
          deps.currentChat?.config?.baseSystemPrompt || ""
        ).trim();
        const enhancePrompt = getSystemPromptEnhancementText().trim();
        // Normalize workspace path: remove trailing slashes, handle cross-platform
        const rawWorkspacePath = deps.currentChat?.config?.workspacePath || "";
        const workspacePath = rawWorkspacePath
          .trim()
          .replace(/\/+$/, "")  // Remove trailing slashes (Unix/Windows)
          .replace(/\\+$/, ""); // Remove trailing backslashes (Windows)

        // Step 1: Send message to Agent
        const response = await agentClientRef.current.sendMessage({
          message: content,
          session_id: deps.currentChat?.config?.agentSessionId,
          system_prompt: baseSystemPrompt || undefined,
          enhance_prompt: enhancePrompt || undefined,
          workspace_path: workspacePath || undefined,
          model: selectedModel || undefined,
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

        // Step 2: Trigger execution (idempotent)
        const executeResult = await agentClientRef.current.execute(session_id);
        console.log("[Agent] Execute status:", executeResult.status);

        // Step 3: Set processing flag to activate event subscription (handled by useAgentEventSubscription)
        if (["started", "already_running"].includes(executeResult.status)) {
          deps.setProcessing(true);
        } else if (executeResult.status === "completed") {
          // Session already completed, no need to process
          console.log("[Agent] Session already completed");
          deps.setProcessing(false);
        } else {
          // Error or other status
          console.error("[Agent] Execute failed:", executeResult.status);
          deps.setProcessing(false);
          throw new Error(`Execute failed: ${executeResult.status}`);
        }
      } catch (error) {
        throw error; // Re-throw to trigger fallback
      }
    },
    [deps, selectedModel],
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

      let isAgentAvailable = agentAvailable;
      if (isAgentAvailable === null) {
        isAgentAvailable = await checkAgentAvailability();
      }

      if (!isAgentAvailable) {
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
        // Note: Don't set isProcessing(false) here - let useAgentEventSubscription handle it
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
          setAgentAvailability(false);
        }
        deps.setProcessing(false);  // Only set false on error
      } finally {
        abortRef.current = null;
        if (streamingMessageIdRef.current) {
          streamingMessageBus.clear(chatId, streamingMessageIdRef.current);
        }
        streamingMessageIdRef.current = null;
        streamingContentRef.current = "";
        // Removed: deps.setProcessing(false) - useAgentEventSubscription handles this
      }
    },
    [
      agentAvailable,
      appMessage,
      checkAgentAvailability,
      deps,
      modal,
      sendWithAgent,
      setAgentAvailability,
    ],
  );

  return {
    sendMessage,
    cancel,
    agentAvailable,
  };
}
