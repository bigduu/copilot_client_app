import { useCallback } from "react";
import type { ChatItem } from "../../types/chat";

interface UseMessageCardPlanActionsProps {
  currentChatId?: string | null;
  currentChat?: ChatItem | null;
  updateChat: (chatId: string, update: Partial<ChatItem>) => void;
  sendMessage: (message: string) => Promise<void>;
}

export const useMessageCardPlanActions = ({
  currentChatId,
  currentChat,
  updateChat,
  sendMessage,
}: UseMessageCardPlanActionsProps) => {
  const handleExecutePlan = useCallback(async () => {
    if (!currentChatId || !currentChat) return;
    try {
      updateChat(currentChatId, {
        config: {
          ...currentChat.config,
          agentRole: "actor",
        },
      });
    } catch (error) {
      console.error("Failed to switch to Actor role:", error);
    }
  }, [currentChat, currentChatId, updateChat]);

  const handleRefinePlan = useCallback(
    async (feedback: string) => {
      if (!feedback.trim()) return;
      try {
        await sendMessage(feedback.trim());
      } catch (error) {
        console.error("Failed to send plan refinement:", error);
      }
    },
    [sendMessage],
  );

  const handleQuestionAnswer = useCallback(
    async (answer: string) => {
      if (!answer) return;
      try {
        await sendMessage(answer);
      } catch (error) {
        console.error("Failed to send answer:", error);
        throw error;
      }
    },
    [sendMessage],
  );

  return { handleExecutePlan, handleRefinePlan, handleQuestionAnswer };
};
