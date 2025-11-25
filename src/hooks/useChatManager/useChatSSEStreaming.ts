import { useCallback, useEffect, useRef } from "react";
import { App as AntApp } from "antd";
import type {
  AssistantTextMessage,
  MessageImage,
  UserMessage,
} from "../../types/chat";
import type { ImageFile } from "../../utils/imageUtils";
import { transformMessageDTOToMessage } from "../../utils/messageTransformers";
import type { UseChatState } from "./types";

/**
 * Hook for SSE streaming and message sending
 * Handles Signal-Pull SSE architecture for real-time updates
 */
export interface UseChatSSEStreaming {
  sendMessage: (content: string, images?: ImageFile[]) => Promise<void>;
}

interface UseChatSSEStreamingDeps {
  currentChat: any | null;
  addMessage: (chatId: string, message: any) => Promise<void>;
  setMessages: (chatId: string, messages: any[]) => void;
  updateChat: (chatId: string, updates: any) => void;
}

export function useChatSSEStreaming(
  deps: UseChatSSEStreamingDeps
): UseChatSSEStreaming {
  const { modal, message: appMessage } = AntApp.useApp();
  
  // SSE subscription cleanup
  const sseUnsubscribeRef = useRef<(() => void) | null>(null);
  const currentSequenceRef = useRef<number>(0);
  const currentMessageIdRef = useRef<string | null>(null);

  // Cleanup SSE subscription when component unmounts or chat changes
  useEffect(() => {
    return () => {
      if (sseUnsubscribeRef.current) {
        console.log("[useChatSSEStreaming] Cleaning up SSE subscription");
        sseUnsubscribeRef.current();
        sseUnsubscribeRef.current = null;
      }
    };
  }, [deps.currentChat?.id]);

  const sendMessage = useCallback(
    async (content: string, images?: ImageFile[]) => {
      if (!deps.currentChat) {
        modal.info({
          title: "No Active Chat",
          content: "Please create or select a chat before sending a message.",
        });
        return;
      }
      
      console.log(
        "[useChatSSEStreaming] sendMessage: currentChat.config on entry:",
        deps.currentChat.config
      );
      const chatId = deps.currentChat.id;

      // ✅ Signal-Pull SSE architecture
      console.log("[useChatSSEStreaming] Using Signal-Pull SSE architecture");

      const processedContent = content;
      const messageImages: MessageImage[] =
        images?.map((img) => ({
          id: img.id,
          base64: img.base64,
          name: img.name,
          size: img.size,
          type: img.type,
        })) || [];

      const userMessage: UserMessage = {
        role: "user",
        content: processedContent,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        images: messageImages,
      };

      // Add user message locally for optimistic UI update
      await deps.addMessage(chatId, userMessage);

      try {
        const { backendContextService } = await import(
          "../../services/BackendContextService"
        );

        // Create temporary assistant message for streaming
        const assistantMessageId = crypto.randomUUID();
        const assistantMessage: AssistantTextMessage = {
          id: assistantMessageId,
          role: "assistant",
          type: "text",
          content: "",
          createdAt: new Date().toISOString(),
        };

        // Add empty assistant message to show streaming indicator
        await deps.addMessage(chatId, assistantMessage);

        // Reset sequence tracking
        currentSequenceRef.current = 0;
        currentMessageIdRef.current = assistantMessageId;
        let accumulatedContent = "";

        // Queue to ensure sequential processing of content_delta events
        let pullQueue = Promise.resolve();

        console.log(
          `[useChatSSEStreaming] Starting Signal-Pull SSE for chat ${chatId}`
        );

        // 1. Subscribe to SSE events FIRST (before sending message)
        const unsubscribe = backendContextService.subscribeToContextEvents(
          chatId,
          async (event) => {
            console.log(`[useChatSSEStreaming] SSE event received:`, event.type);

            switch (event.type) {
              case "message_created":
                console.log(
                  `[useChatSSEStreaming] MessageCreated event: message_id=${event.message_id}, role=${event.role}`
                );
                // Reset sequence tracking for new message
                currentSequenceRef.current = 0;
                accumulatedContent = "";
                break;

              case "content_delta":
                // Queue this pull operation to ensure sequential processing
                pullQueue = pullQueue.then(async () => {
                  try {
                    const fromSequence = currentSequenceRef.current;
                    console.log(
                      `[useChatSSEStreaming] ContentDelta: event.current_sequence=${event.current_sequence}, pulling from ${fromSequence}`
                    );

                    // Pull new chunks from current sequence
                    const contentResponse =
                      await backendContextService.getMessageContent(
                        event.context_id,
                        event.message_id,
                        fromSequence
                      );

                    console.log(
                      `[useChatSSEStreaming] Pulled ${contentResponse.chunks.length} chunks, new current_sequence=${contentResponse.current_sequence}`
                    );

                    // Accumulate content from NEW chunks only
                    if (
                      contentResponse.chunks &&
                      contentResponse.chunks.length > 0
                    ) {
                      for (const chunk of contentResponse.chunks) {
                        accumulatedContent += chunk.delta;
                      }

                      console.log(
                        `[useChatSSEStreaming] Accumulated content length: ${accumulatedContent.length}`
                      );

                      // Update message in UI
                      const updatedAssistantMessage: AssistantTextMessage = {
                        ...assistantMessage,
                        content: accumulatedContent,
                      };

                      // Update messages via callback
                      const updatedMessages = deps.currentChat.messages.map(
                        (msg: any) =>
                          msg.id === assistantMessageId
                            ? updatedAssistantMessage
                            : msg
                      );
                      deps.setMessages(chatId, updatedMessages);
                    }

                    // Update sequence tracking AFTER processing
                    currentSequenceRef.current =
                      contentResponse.current_sequence;
                  } catch (error) {
                    console.error(
                      "[useChatSSEStreaming] Failed to pull content:",
                      error
                    );
                    appMessage.error("Failed to receive message content");
                  }
                });
                break;

              case "message_completed":
                console.log(
                  `[useChatSSEStreaming] Message completed, fetching final state`
                );

                // Cleanup SSE subscription
                if (sseUnsubscribeRef.current) {
                  sseUnsubscribeRef.current();
                  sseUnsubscribeRef.current = null;
                }

                // Fetch final messages from backend to ensure consistency
                try {
                  const messages =
                    await backendContextService.getMessages(chatId);
                  const allMessages = messages.messages
                    .map((msg: any) => transformMessageDTOToMessage(msg))
                    .filter(Boolean);

                  deps.setMessages(chatId, allMessages);
                  console.log(
                    `[useChatSSEStreaming] Final messages synced: ${allMessages.length} messages`
                  );
                } catch (error) {
                  console.error(
                    "[useChatSSEStreaming] Failed to fetch final messages:",
                    error
                  );
                }
                break;

              case "state_changed":
                console.log(
                  `[useChatSSEStreaming] Backend state changed: ${event.new_state}`
                );
                break;

              case "title_updated":
                console.log(
                  `[useChatSSEStreaming] Title updated to: "${event.title}"`
                );
                // Update the chat title in the UI immediately
                deps.updateChat(chatId, { title: event.title });
                break;

              case "heartbeat":
                // Keep-alive, no action needed
                break;

              default:
                console.warn(
                  "[useChatSSEStreaming] Unknown SSE event type:",
                  (event as any).type
                );
            }
          },
          (error) => {
            console.error("[useChatSSEStreaming] SSE error:", error);
            appMessage.error("Connection error. Please try again.");

            // Cleanup on error
            if (sseUnsubscribeRef.current) {
              sseUnsubscribeRef.current();
              sseUnsubscribeRef.current = null;
            }
          }
        );

        // Store unsubscribe function for cleanup
        sseUnsubscribeRef.current = unsubscribe;

        // 2. Send message to backend AFTER subscribing to SSE
        try {
          await backendContextService.sendMessage(chatId, processedContent);
          console.log(`[useChatSSEStreaming] Message sent successfully`);
        } catch (error) {
          console.error("[useChatSSEStreaming] Failed to send message:", error);
          appMessage.error("Failed to send message. Please try again.");

          // Cleanup SSE subscription on error
          if (sseUnsubscribeRef.current) {
            sseUnsubscribeRef.current();
            sseUnsubscribeRef.current = null;
          }
        }
      } catch (error) {
        console.error("[useChatSSEStreaming] Failed to setup SSE:", error);
        appMessage.error("Failed to setup connection. Please try again.");
      }
    },
    [deps, modal, appMessage]
  );

  return {
    sendMessage,
  };
}
