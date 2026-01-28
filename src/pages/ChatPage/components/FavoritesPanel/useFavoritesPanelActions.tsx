import { useCallback, useState } from "react";
import { message } from "antd";
import type { FavoriteItem } from "../../types/chat";
import { ExportService } from "../../services/ExportService";
import { formatFavoriteDate } from "./favoritesUtils";

interface UseFavoritesPanelActionsProps {
  currentChatId: string | null;
  favorites: FavoriteItem[];
  createNewChat: (title?: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  token: any;
}

export const useFavoritesPanelActions = ({
  currentChatId,
  favorites,
  createNewChat,
  sendMessage,
  token,
}: UseFavoritesPanelActionsProps) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);

  const exportAsMarkdown = useCallback(
    async (items: FavoriteItem[]) => {
      if (!currentChatId) {
        throw new Error("No chat selected");
      }

      const result = await ExportService.exportFavorites({
        format: "markdown",
        data: items,
        chatId: currentChatId,
      });

      if (!result.success) {
        throw new Error(result.error || "Export failed");
      }

      return result.filename;
    },
    [currentChatId],
  );

  const exportAsPDF = useCallback(
    async (items: FavoriteItem[]) => {
      if (!currentChatId) {
        throw new Error("No chat selected");
      }

      const result = await ExportService.exportFavorites({
        format: "pdf",
        data: items,
        chatId: currentChatId,
      });

      if (!result.success) {
        throw new Error(result.error || "Export failed");
      }

      return result.filename;
    },
    [currentChatId],
  );

  const exportFavorites = useCallback(
    async (format: "markdown" | "pdf") => {
      if (favorites.length === 0) {
        message.warning("No favorites to export");
        return;
      }

      setIsExporting(true);
      const hideLoading = message.loading(
        `Exporting favorites as ${format.toUpperCase()}...`,
        0,
      );

      try {
        if (format === "markdown") {
          const filename = await exportAsMarkdown(favorites);
          message.success({
            content: (
              <div>
                <div>✅ Markdown file exported successfully!</div>
                <div style={{ fontSize: 12 }}>File name: {filename}</div>
                <div style={{ fontSize: 12 }}>
                  Saved to: User selected location
                </div>
              </div>
            ),
            duration: 4,
          });
        } else if (format === "pdf") {
          const filename = await exportAsPDF(favorites);
          message.success({
            content: (
              <div>
                <div>✅ PDF file exported successfully!</div>
                <div style={{ fontSize: 12 }}>File name: {filename}</div>
                <div style={{ fontSize: 12 }}>
                  Saved to: User selected location
                </div>
                <div style={{ fontSize: 12, color: token.colorSuccess }}>
                  💡 File saved to your chosen location, ready to open
                </div>
              </div>
            ),
            duration: 5,
          });
        }
      } catch (error) {
        console.error(`Failed to export as ${format}:`, error);
        message.error(
          `Failed to export favorites as ${format.toUpperCase()}. Please try again.`,
        );
      } finally {
        hideLoading();
        setIsExporting(false);
      }
    },
    [exportAsMarkdown, exportAsPDF, favorites, token],
  );

  const summarizeFavorites = useCallback(async () => {
    if (favorites.length === 0) {
      message.warning("No favorites to summarize");
      return;
    }

    setIsSummarizing(true);
    const hideLoading = message.loading("Creating favorites summary...", 0);

    try {
      let summaryContent =
        "Please provide a comprehensive summary of the following favorite messages from our conversation:\\n\\n";

      favorites.forEach((fav, index) => {
        summaryContent += `### ${fav.role === "user" ? "User" : "Assistant"} Message ${
          index + 1
        }\\n`;
        summaryContent += `**Created:** ${formatFavoriteDate(fav.createdAt)}\\n\\n`;
        summaryContent += fav.content + "\\n\\n";

        if (fav.note) {
          summaryContent += `**Note:** ${fav.note}\\n\\n`;
        }

        summaryContent += "---\\n\\n";
      });

      summaryContent += "Please analyze these favorites and provide:\\n";
      summaryContent +=
        "1. **Key Topics**: Main themes and subjects discussed\\n";
      summaryContent +=
        "2. **Important Insights**: Key learnings or conclusions\\n";
      summaryContent +=
        "3. **Action Items**: Any tasks or follow-ups mentioned\\n";
      summaryContent +=
        "4. **Summary**: A concise overview of the conversation highlights\\n\\n";
      summaryContent += `Total favorites analyzed: ${favorites.length}`;

      await createNewChat(
        `📋 Favorites Summary - ${formatFavoriteDate(Date.now())}`,
      );

      setTimeout(async () => {
        try {
          await sendMessage(summaryContent);
          console.log("Sent favorites summary message to new chat");
        } catch (error) {
          console.error("Failed to send summary message:", error);
        }
      }, 100);

      message.success("Favorites summary chat created successfully!");
      console.log("Created new chat with favorites summary");
    } catch (error) {
      console.error("Failed to create favorites summary:", error);
      message.error("Failed to create favorites summary. Please try again.");
    } finally {
      hideLoading();
      setIsSummarizing(false);
    }
  }, [createNewChat, favorites, sendMessage]);

  return {
    exportFavorites,
    summarizeFavorites,
    isExporting,
    isSummarizing,
  };
};
