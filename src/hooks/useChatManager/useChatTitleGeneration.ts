import { useCallback, useRef, useState } from "react";
import { App as AntApp } from "antd";
import { useAppStore } from "../../store";
import type { AssistantTextMessage } from "../../types/chat";
import type { UseChatState } from "./types";

/**
 * Hook for chat title generation and validation
 * Handles both auto and manual title generation
 */
export interface UseChatTitleGeneration {
  titleGenerationState: Record<
    string,
    { status: "idle" | "loading" | "error"; error?: string }
  >;
  autoGenerateTitles: boolean;
  isUpdatingAutoTitlePreference: boolean;
  generateChatTitle: (
    chatId: string,
    options?: { force?: boolean }
  ) => Promise<void>;
  setAutoGenerateTitlesPreference: (enabled: boolean) => Promise<void>;
  isDefaultTitle: (title: string | undefined | null) => boolean;
}

export function useChatTitleGeneration(
  state: UseChatState
): UseChatTitleGeneration {
  const { message: appMessage } = AntApp.useApp();

  const autoGenerateTitles = useAppStore((state) => state.autoGenerateTitles);
  const setAutoGenerateTitlesPreference = useAppStore(
    (state) => state.setAutoGenerateTitlesPreference
  );
  const isUpdatingAutoTitlePreference = useAppStore(
    (state) => state.isUpdatingAutoTitlePreference
  );

  const autoTitleGeneratedRef = useRef<Set<string>>(new Set());
  const titleGenerationInFlightRef = useRef<Set<string>>(new Set());
  const [titleGenerationState, setTitleGenerationState] = useState<
    Record<string, { status: "idle" | "loading" | "error"; error?: string }>
  >({});

  const isDefaultTitle = useCallback((title: string | undefined | null) => {
    if (!title) return true;
    const normalized = title.trim().toLowerCase();
    if (normalized.length === 0) return true;
    if (normalized === "new chat" || normalized === "main") return true;
    return normalized.startsWith("new chat -");
  }, []);

  const generateChatTitle = useCallback(
    async (chatId: string, options?: { force?: boolean }) => {
      const chat = state.chats.find((c) => c.id === chatId);
      if (!chat) {
        return;
      }

      const userAssistantMessages = chat.messages.filter((msg) => {
        if (msg.role === "user") return true;
        if (msg.role === "assistant" && "type" in msg) {
          return (msg as AssistantTextMessage).type === "text";
        }
        return false;
      });

      const isAuto = !options?.force;
      if (isAuto && !autoGenerateTitles) {
        return;
      }
      const MAX_AUTO_MESSAGES = 6;

      if (isAuto) {
        if (titleGenerationInFlightRef.current.has(chatId)) {
          return;
        }
        if (autoTitleGeneratedRef.current.has(chatId)) {
          return;
        }
        if (!isDefaultTitle(chat.title)) {
          return;
        }
        if (userAssistantMessages.length === 0) {
          return;
        }
        if (userAssistantMessages.length > MAX_AUTO_MESSAGES) {
          return;
        }
      }

      titleGenerationInFlightRef.current.add(chatId);
      setTitleGenerationState((prev) => ({
        ...prev,
        [chatId]: { status: "loading" },
      }));

      try {
        const { BackendContextService } = await import(
          "../../services/BackendContextService"
        );
        const backendService = new BackendContextService();
        const response = await backendService.generateTitle(chatId, {
          maxLength: 60,
          messageLimit: 6,
        });
        const candidate = response.title?.trim();
        if (!candidate) {
          throw new Error("生成的标题为空");
        }

        // Backend now saves the title, so we sync from backend
        // Fetch the updated context to get the saved title
        const context = await backendService.getContext(chatId);
        const savedTitle = context.title || candidate;

        console.log(
          `[useChatTitleGeneration] Updating chat ${chatId} title to: "${savedTitle}"`
        );
        state.updateChat(chatId, { title: savedTitle });
        if (!isAuto || savedTitle.toLowerCase() !== "new chat") {
          autoTitleGeneratedRef.current.add(chatId);
        }

        setTitleGenerationState((prev) => ({
          ...prev,
          [chatId]: { status: "idle" },
        }));

        if (options?.force) {
          appMessage?.success?.("聊天标题已更新");
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "生成标题失败";
        setTitleGenerationState((prev) => ({
          ...prev,
          [chatId]: { status: "error", error: errorMessage },
        }));
        if (options?.force) {
          appMessage?.error?.(errorMessage);
        } else {
          appMessage?.warning?.(errorMessage);
        }
      } finally {
        titleGenerationInFlightRef.current.delete(chatId);
      }
    },
    [appMessage, autoGenerateTitles, isDefaultTitle, state]
  );

  return {
    titleGenerationState,
    autoGenerateTitles,
    isUpdatingAutoTitlePreference,
    generateChatTitle,
    setAutoGenerateTitlesPreference,
    isDefaultTitle,
  };
}
