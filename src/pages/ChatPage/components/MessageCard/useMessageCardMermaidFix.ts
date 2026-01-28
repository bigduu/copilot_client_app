import { useMemo } from "react";
import { getOpenAIClient } from "../../services/openaiClient";
import type { ChatItem, Message } from "../../types/chat";

interface UseMessageCardMermaidFixProps {
  message: Message;
  messageId: string;
  selectedModel?: string | null;
  currentChatId?: string | null;
  currentChat?: ChatItem | null;
  updateChat: (chatId: string, update: Partial<ChatItem>) => void;
}

const extractMermaidCode = (content: string) => {
  const match = content.match(/```mermaid\s*([\s\S]*?)```/i);
  if (match) return match[1].trim();
  return content.trim();
};

const replaceMermaidBlock = (
  content: string,
  originalChart: string,
  fixedChart: string,
) => {
  const normalizedOriginal = originalChart.trim();
  const normalizedFixed = extractMermaidCode(fixedChart);
  let replaced = false;
  const updated = content.replace(
    /```mermaid\s*([\s\S]*?)```/gi,
    (match, block) => {
      if (replaced) return match;
      if (block.trim() !== normalizedOriginal) return match;
      replaced = true;
      return `\`\`\`mermaid\n${normalizedFixed}\n\`\`\``;
    },
  );
  return replaced ? updated : null;
};

const fixMermaidWithAI = async (chart: string, model?: string | null) => {
  const client = getOpenAIClient();
  const response = await client.chat.completions.create({
    model: model || "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Fix Mermaid diagrams. Return only corrected Mermaid code without markdown fences or extra text.",
      },
      {
        role: "user",
        content: chart,
      },
    ],
    temperature: 0,
  });
  const content = response.choices?.[0]?.message?.content ?? "";
  return extractMermaidCode(content);
};

export const useMessageCardMermaidFix = ({
  message,
  messageId,
  selectedModel,
  currentChatId,
  currentChat,
  updateChat,
}: UseMessageCardMermaidFixProps) => {
  const canFixMermaid =
    message.role === "assistant" &&
    message.type === "text" &&
    Boolean(currentChatId && currentChat);

  return useMemo(() => {
    if (!canFixMermaid) return undefined;

    return async (chart: string) => {
      if (!currentChatId || !currentChat) {
        throw new Error("No active chat available");
      }
      if (message.role !== "assistant" || message.type !== "text") {
        throw new Error("Mermaid fix is only available for assistant messages");
      }

      const fixedChart = await fixMermaidWithAI(chart, selectedModel);
      if (!fixedChart) {
        throw new Error("AI did not return a Mermaid fix");
      }

      const updatedContent = replaceMermaidBlock(
        message.content,
        chart,
        fixedChart,
      );
      if (!updatedContent) {
        throw new Error("Unable to locate Mermaid block to update");
      }

      const updatedMessages = currentChat.messages.map((msg) => {
        if (
          msg.id === messageId &&
          msg.role === "assistant" &&
          msg.type === "text"
        ) {
          return { ...msg, content: updatedContent };
        }
        return msg;
      });
      updateChat(currentChatId, { messages: updatedMessages });
    };
  }, [
    canFixMermaid,
    currentChat,
    currentChatId,
    message,
    messageId,
    selectedModel,
    updateChat,
  ]);
};
