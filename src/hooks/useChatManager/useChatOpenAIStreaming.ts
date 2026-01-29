import { useCallback, useRef } from "react";
import { App as AntApp } from "antd";
import { BodhiConfigService } from "../../services/BodhiConfigService";
import { skillService } from "../../services/SkillService";
import { getOpenAIClient } from "../../services/openaiClient";
import { useAppStore } from "../../store";
import type { Message, UserMessage } from "../../types/chat";
import type { ImageFile } from "../../utils/imageUtils";
import { streamingMessageBus } from "../../utils/streamingMessageBus";
import { buildRequestMessages } from "./openAiMessageMapping";
import { streamOpenAIWithTools } from "./openAiStreamingRunner";

export interface UseChatOpenAIStreaming {
  sendMessage: (content: string, images?: ImageFile[]) => Promise<void>;
  cancel: () => void;
}

interface UseChatOpenAIStreamingDeps {
  currentChat: any | null;
  addMessage: (chatId: string, message: any) => Promise<void>;
  setProcessing: (isProcessing: boolean) => void;
}

export function useChatOpenAIStreaming(
  deps: UseChatOpenAIStreamingDeps,
): UseChatOpenAIStreaming {
  const { modal, message: appMessage } = AntApp.useApp();
  const abortRef = useRef<AbortController | null>(null);
  const toolsCacheRef = useRef<any[] | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const streamingContentRef = useRef<string>("");
  const selectedModel = useAppStore((state) => state.selectedModel);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const resolveTools = useCallback(async (chatId?: string) => {
    if (toolsCacheRef.current) return toolsCacheRef.current;
    
    // Try to get filtered tools based on enabled skills
    try {
      const filteredTools = await skillService.getFilteredTools(chatId);
      if (filteredTools && filteredTools.length > 0) {
        // Convert tool names to OpenAI tool format
        const configService = BodhiConfigService.getInstance();
        const allTools = await configService.getTools();
        const toolDefs = allTools.tools.filter((t: any) => 
          filteredTools.includes(t.function?.name)
        );
        toolsCacheRef.current = toolDefs;
        return toolDefs;
      }
    } catch (e) {
      console.log("[useChatOpenAIStreaming] Failed to get filtered tools, falling back to all tools");
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
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const client = getOpenAIClient(chatId);
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
      } catch (error) {
        if (streamingMessageIdRef.current) {
          streamingMessageBus.clear(chatId, streamingMessageIdRef.current);
        }
        streamingMessageIdRef.current = null;
        streamingContentRef.current = "";
        if ((error as any).name === "AbortError") {
          appMessage.info("Request cancelled");
        } else {
          console.error(
            "[useChatOpenAIStreaming] Failed to send message:",
            error,
          );
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
    [deps, modal, appMessage, resolveTools, buildMessages, selectedModel],
  );

  return {
    sendMessage,
    cancel,
  };
}
