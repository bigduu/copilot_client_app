import { useCallback, useEffect, useMemo, useState } from "react";

import type { Message, UserSystemPrompt } from "../../types/chat";
import { SystemPromptService } from "../../services/SystemPromptService";
import {
  buildEnhancedSystemPrompt,
  getSystemPromptEnhancementText,
} from "../../utils/systemPromptEnhancement";

type UseSystemPromptContentArgs = {
  currentChat: { id: string; config?: { systemPromptId?: string } } | null;
  message: Message;
  systemPrompts: UserSystemPrompt[];
};

export const useSystemPromptContent = ({
  currentChat,
  message,
  systemPrompts,
}: UseSystemPromptContentArgs) => {
  const [categoryDescription, setCategoryDescription] = useState<string>("");
  const [basePrompt, setBasePrompt] = useState<string>("");
  const [enhancedPrompt, setEnhancedPrompt] = useState<string | null>(null);
  const [loadingEnhanced, setLoadingEnhanced] = useState(false);
  const [showEnhanced, setShowEnhanced] = useState(false);

  const systemPromptService = useMemo(
    () => SystemPromptService.getInstance(),
    [],
  );
  const systemMessageContent =
    message.role === "system" && typeof message.content === "string"
      ? message.content
      : "";

  useEffect(() => {
    if (message.role === "system") {
      setEnhancedPrompt(null);
      setShowEnhanced(false);
    }
  }, [message.id, message.role, systemMessageContent]);

  useEffect(() => {
    const loadBasePrompt = async () => {
      if (!currentChat?.config) {
        return;
      }

      try {
        const { systemPromptId } = currentChat.config;

        if (systemPromptId) {
          const userPrompt = systemPrompts.find((p) => p.id === systemPromptId);
          if (userPrompt?.content) {
            setBasePrompt(userPrompt.content);
            return;
          }
          if (userPrompt?.description) {
            setCategoryDescription(userPrompt.description);
          }
        }

        if (systemPromptId) {
          const preset =
            await systemPromptService.findPresetById(systemPromptId);
          if (preset?.content) {
            setBasePrompt(preset.content);
            return;
          }
          if (preset?.description) {
            setCategoryDescription(preset.description);
          }
        }
      } catch (error) {
        console.error("Failed to load base prompt:", error);
      }
    };

    loadBasePrompt();
  }, [currentChat?.config, systemPromptService, systemPrompts]);

  const loadEnhancedPrompt = useCallback(async () => {
    if (!basePrompt || loadingEnhanced) return;

    setLoadingEnhanced(true);
    try {
      const enhancementText = getSystemPromptEnhancementText();
      const enhanced = buildEnhancedSystemPrompt(basePrompt, enhancementText);

      setEnhancedPrompt(enhanced);
      setShowEnhanced(true);
    } catch (error) {
      console.error("Failed to load enhanced prompt:", error);
    } finally {
      setLoadingEnhanced(false);
    }
  }, [basePrompt, loadingEnhanced]);

  const promptToDisplay = useMemo(() => {
    if (showEnhanced && enhancedPrompt) {
      return enhancedPrompt;
    }
    if (basePrompt) {
      return basePrompt;
    }
    if (categoryDescription) {
      return categoryDescription;
    }
    if (message.role === "system") {
      return systemMessageContent;
    }
    return "System prompt is being prepared...";
  }, [
    showEnhanced,
    enhancedPrompt,
    basePrompt,
    categoryDescription,
    message.role,
    systemMessageContent,
  ]);

  return {
    basePrompt,
    categoryDescription,
    enhancedPrompt,
    loadingEnhanced,
    loadEnhancedPrompt,
    promptToDisplay,
    showEnhanced,
    setShowEnhanced,
    systemMessageContent,
  };
};
