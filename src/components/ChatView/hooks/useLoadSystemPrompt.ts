import { useEffect, useState } from "react";
import type { Message } from "../../../types/chat";
import type { MessageDTO } from "../../../services/BackendContextService";
import { backendContextService } from "../../../services/BackendContextService";

interface UseLoadSystemPromptProps {
  currentContext: any;
  backendMessages: MessageDTO[];
  currentMessages: Message[];
}

/**
 * Hook to load and manage system prompt from backend context
 */
export const useLoadSystemPrompt = ({
  currentContext,
  backendMessages,
  currentMessages,
}: UseLoadSystemPromptProps) => {
  const [loadedSystemPrompt, setLoadedSystemPrompt] = useState<{
    id: string;
    content: string;
  } | null>(null);

  useEffect(() => {
    const loadSystemPrompt = async () => {
      // First, check if there's already a system message in the messages
      const allMessages =
        backendMessages.length > 0 ? backendMessages : currentMessages;
      const existingSystemMessage = allMessages.find(
        (msg: Message | MessageDTO) => msg.role === "system"
      );
      if (existingSystemMessage) {
        setLoadedSystemPrompt(null);
        return;
      }

      // Priority 1: Get from active branch's system_prompt (if exists)
      if (currentContext?.branches && currentContext.branches.length > 0) {
        const activeBranch = currentContext.branches.find(
          (b: any) => b.name === currentContext.active_branch_name
        );
        if (activeBranch?.system_prompt?.content) {
          setLoadedSystemPrompt({
            id: activeBranch.system_prompt.id,
            content: activeBranch.system_prompt.content,
          });
          return;
        }
      }

      // Priority 2: Get from context.config.system_prompt_id (source of truth)
      const systemPromptId = currentContext?.config?.system_prompt_id;

      if (!systemPromptId) {
        setLoadedSystemPrompt(null);
        return;
      }

      // Fetch system prompt content from backend API using the ID
      try {
        const prompt =
          await backendContextService.getSystemPrompt(systemPromptId);
        if (prompt?.content) {
          setLoadedSystemPrompt({
            id: systemPromptId,
            content: prompt.content,
          });
        } else {
          console.warn(
            `System prompt ${systemPromptId} exists but has no content`
          );
          setLoadedSystemPrompt(null);
        }
      } catch (error) {
        console.error(
          `Failed to load system prompt ${systemPromptId} from backend:`,
          error
        );
        setLoadedSystemPrompt(null);
      }
    };

    loadSystemPrompt();
  }, [
    currentContext,
    currentContext?.config?.system_prompt_id,
    currentContext?.branches,
    currentContext?.active_branch_name,
    backendMessages,
    currentMessages,
  ]);

  return loadedSystemPrompt;
};
