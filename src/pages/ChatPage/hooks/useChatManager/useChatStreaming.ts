import { useCallback, useEffect, useRef, useState } from "react";
import { App as AntApp } from "antd";
import { BodhiConfigService } from "../../services/BodhiConfigService";
import { skillService } from "../../services/SkillService";
import { AgentClient } from "../../services/AgentService";
import { getOpenAIClient } from "../../services/openaiClient";
import { useAppStore } from "../../store";
import type { Message, UserMessage } from "../../types/chat";
import type { ImageFile } from "../../utils/imageUtils";
import { streamingMessageBus } from "../../utils/streamingMessageBus";
import { buildRequestMessages } from "./openAiMessageMapping";
import { streamOpenAIWithTools } from "./openAiStreamingRunner";

export interface UseChatStreaming {
  sendMessage: (content: string, images?: ImageFile[]) => Promise<void>;
  cancel: () => void;
  isUsingAgent: boolean;
  agentAvailable: boolean | null;
}

interface UseChatStreamingDeps {
  currentChat: any | null;
  addMessage: (chatId: string, message: any) => Promise<void>;
  setProcessing: (isProcessing: boolean) => void;
}

/**
 * Unified chat streaming hook
 * 
 * Priority:
 * 1. Try Agent Server (localhost:8080) - supports multi-turn tool execution
 * 2. Fall back to direct OpenAI streaming - single-turn tool execution
 */
export function useChatStreaming(
  deps: UseChatStreamingDeps,
): UseChatStreaming {
  const { modal, message: appMessage } = AntApp.useApp();
  const abortRef = useRef<AbortController | null>(null);
  const toolsCacheRef = useRef<any[] | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const streamingContentRef = useRef<string>("");
  const agentClientRef = useRef(new AgentClient());
  
  const selectedModel = useAppStore((state) => state.selectedModel);
  const enabledSkillIds = useAppStore((state) => state.enabledSkillIds);
  
  // Track Agent availability
  const [agentAvailable, setAgentAvailable] = useState<boolean | null>(null);
  const [isUsingAgent, setIsUsingAgent] = useState(false);

  // Check Agent availability on mount
  useEffect(() => {
    const checkAgent = async () => {
      const available = await agentClientRef.current.healthCheck();
      setAgentAvailable(available);
      console.log(`[useChatStreaming] Agent Server ${available ? "available" : "not available"}`);
    };
    checkAgent();
  }, []);

  // Clear tools cache when enabled skills change
  useEffect(() => {
    toolsCacheRef.current = null;
  }, [enabledSkillIds]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const resolveTools = useCallback(async (chatId?: string) => {
    if (toolsCacheRef.current) return toolsCacheRef.current;
    
    // Try to get filtered tools based on enabled skills
    try {
      const filteredTools = await skillService.getFilteredTools(chatId);
      if (filteredTools && filteredTools.length > 0) {
        const configService = BodhiConfigService.getInstance();
        const allTools = await configService.getTools();
        const toolDefs = allTools.tools.filter((t: any) => 
          filteredTools.includes(t.function?.name)
        );
        toolsCacheRef.current = toolDefs;
        return toolDefs;
      }
    } catch (e) {
      console.log("[useChatStreaming] Failed to get filtered tools, falling back to all tools");
    }
    
    // Fallback to all tools
    const configService = BodhiConfigService.getInstance();
    const data = await configService.getTools();
    toolsCacheRef.current = data.tools;
    return data.tools;
  }, []);

  const buildMessages = useCallback(
    (messages: Message[]) =>
      buildRequestMessages(
        messages,
        deps.currentChat?.config?.baseSystemPrompt || "",
      ),
    [deps.currentChat?.config?.baseSystemPrompt],
  );

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
        });

        const { session_id } = response;

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
        const toolCallsInProgress = new Map<string, { name: string }>();

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

            onToolStart: (toolCallId: string, toolName: string) => {
              toolCallsInProgress.set(toolCallId, { name: toolName });
              
              const indicator = `\n\n🔧 **Using tool**: ${toolName}\n`;
              streamingContentRef.current += indicator;
              streamingMessageBus.publish({
                chatId,
                messageId: streamingMessageId,
                content: streamingContentRef.current,
              });
            },

            onToolComplete: (toolCallId: string, result: any) => {
              const toolCall = toolCallsInProgress.get(toolCallId);
              if (toolCall) {
                toolCallsInProgress.delete(toolCallId);
                
                const successIcon = result?.success ? "✅" : "❌";
                const resultPreview = result?.result?.substring(0, 200) || "";
                const indicator = `${successIcon} **Result**: \`\`\`\n${resultPreview}\n\`\`\`\n\n`;
                
                streamingContentRef.current += indicator;
                streamingMessageBus.publish({
                  chatId,
                  messageId: streamingMessageId,
                  content: streamingContentRef.current,
                });
              }
            },

            onToolError: (toolCallId: string, error: string) => {
              toolCallsInProgress.delete(toolCallId);
              
              const indicator = `\n\n❌ **Tool Error**: ${error}\n\n`;
              streamingContentRef.current += indicator;
              streamingMessageBus.publish({
                chatId,
                messageId: streamingMessageId,
                content: streamingContentRef.current,
              });
            },

            onComplete: async () => {
              if (streamingContentRef.current) {
                await deps.addMessage(chatId, {
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
              
              streamingMessageIdRef.current = null;
              streamingContentRef.current = "";
            },

            onError: async (errorMessage: string) => {
              console.error("Agent error:", errorMessage);
              
              await deps.addMessage(chatId, {
                id: `error-${Date.now()}`,
                role: "assistant",
                content: `❌ **Error**: ${errorMessage}`,
                createdAt: new Date().toISOString(),
                isError: true,
              });
              
              streamingMessageIdRef.current = null;
              streamingContentRef.current = "";
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

  /**
   * Send message using direct OpenAI
   */
  const sendWithOpenAI = useCallback(
    async (_content: string, chatId: string, _userMessage: UserMessage, updatedMessages: Message[]) => {
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const client = getOpenAIClient();
        const tools = await resolveTools(chatId);
        const model = selectedModel || "gpt-4o-mini";
        const openaiMessages = buildMessages(updatedMessages);

        await streamOpenAIWithTools({
          chatId,
          client,
          tools,
          model,
          openaiMessages,
          controller,
          streamingMessageIdRef,
          streamingContentRef,
          addMessage: deps.addMessage,
        });
      } finally {
        abortRef.current = null;
      }
    },
    [deps, resolveTools, buildMessages, selectedModel]
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

      const updatedMessages = [...deps.currentChat.messages, userMessage];
      await deps.addMessage(chatId, userMessage);

      deps.setProcessing(true);

      // Try Agent first, fallback to OpenAI
      if (agentAvailable) {
        try {
          setIsUsingAgent(true);
          console.log("[useChatStreaming] Using Agent Server");
          await sendWithAgent(content, chatId, userMessage);
          return;
        } catch (error) {
          console.warn("[useChatStreaming] Agent failed, falling back to OpenAI:", error);
          // Reset streaming state for fallback
          if (streamingMessageIdRef.current) {
            streamingMessageBus.clear(chatId, streamingMessageIdRef.current);
          }
          streamingMessageIdRef.current = null;
          streamingContentRef.current = "";
          // Mark agent as unavailable for next time
          setAgentAvailable(false);
        }
      }

      // Fallback to OpenAI
      setIsUsingAgent(false);
      console.log("[useChatStreaming] Using direct OpenAI");
      
      try {
        await sendWithOpenAI(content, chatId, userMessage, updatedMessages);
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
    [deps, modal, appMessage, agentAvailable, sendWithAgent, sendWithOpenAI]
  );

  return {
    sendMessage,
    cancel,
    isUsingAgent,
    agentAvailable,
  };
}
