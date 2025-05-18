import { Channel, invoke } from "@tauri-apps/api/core";
import { message } from "antd";
import { FavoriteItem } from "../types/chat";

interface ExportContext {
  currentChatId: string | null;
  getCurrentChatFavorites: () => FavoriteItem[];
}

export const createExportFavorites = (context: ExportContext) => {
  const exportFavorites = async (format: "markdown" | "pdf") => {
    const { currentChatId, getCurrentChatFavorites } = context;

    if (!currentChatId) {
      message.error("No chat selected");
      return;
    }

    const chatFavorites = getCurrentChatFavorites();
    if (chatFavorites.length === 0) {
      message.error("No favorites to export");
      return;
    }

    // Build markdown content
    let markdownContent = `# Chat Favorites Export\n\n`;
    markdownContent += `Generated: ${new Date().toLocaleString()}\n\n`;

    chatFavorites.forEach((fav: FavoriteItem, index: number) => {
      markdownContent += `## ${fav.role === "user" ? "You" : "Assistant"} (${
        index + 1
      })\n\n`;
      markdownContent += fav.content;
      markdownContent += "\n\n";
      if (fav.note) {
        markdownContent += `> Note: ${fav.note}\n\n`;
      }
      markdownContent += "---\n\n";
    });

    const messageKey = format === "markdown" ? "export-md" : "export-pdf";
    message.loading({
      content: `Preparing ${format.toUpperCase()} export...`,
      key: messageKey,
    });

    try {
      // Convert content to Uint8Array for Rust command
      const encoder = new TextEncoder();
      const content = format === "markdown" 
        ? encoder.encode(markdownContent)
        : await generatePDFContent(markdownContent);

      // Create a channel for progress updates
      const events = new Channel<any>();
      events.onmessage = (event: any) => {
        switch (event.type) {
          case "started":
            message.loading({
              content: `Saving ${event.fileName}...`,
              key: messageKey,
            });
            break;
          case "progress":
            message.loading({
              content: `Writing file... ${Math.round(
                (event.bytesWritten / content.length) * 100
              )}%`,
              key: messageKey,
            });
            break;
          case "finished":
            message.success({
              content: `Favorites exported to ${format.toUpperCase()} successfully`,
              key: messageKey,
            });
            break;
          case "error":
            message.error({
              content: `Failed to export: ${event.error}`,
              key: messageKey,
            });
            break;
        }
      };

      // Call Rust command to save file
      await invoke("save_file", {
        content: Array.from(content), // Convert Uint8Array to regular array for Tauri
        fileType: format,
        defaultName: `chat-favorites-${currentChatId.substring(0, 8)}`,
        events,
      });
    } catch (error) {
      console.error(`Error exporting to ${format}:`, error);
      message.error({
        content: `Failed to export favorites to ${format.toUpperCase()}`,
        key: messageKey,
      });
    }
  };

  return exportFavorites;
};

// Helper function to generate PDF content
const generatePDFContent = async (markdownContent: string): Promise<Uint8Array> => {
  const jsPDF = (await import("jspdf")).default;
  const doc = new jsPDF({
    compress: true,
    putOnlyUsedFonts: true,
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  // Set font
  doc.setFont("helvetica", "normal");

  // Add title
  doc.setFontSize(18);
  doc.text("Chat Favorites Export", 20, 20);

  // Add generation date
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 20, 30);

  // Convert doc to Uint8Array
  const pdfContent = doc.output("arraybuffer");
  return new Uint8Array(pdfContent);
};
