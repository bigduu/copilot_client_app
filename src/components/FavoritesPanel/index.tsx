import React, { useState } from "react";
import {
  Layout,
  Typography,
  List,
  Card,
  Space,
  Button,
  Empty,
  Tooltip,
  Dropdown,
  theme,
  Input,
  Modal,
  Select,
  Grid,
  Flex,
  message,
} from "antd";
import {
  DeleteOutlined,
  CopyOutlined,
  ExportOutlined,
  BookOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
  EditOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import { useChats } from "../../hooks/useChats";
import { useMessages } from "../../hooks/useMessages";
import { FavoriteItem } from "../../types/chat";
import { useChatStore } from "../../store/chatStore";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

const { Sider } = Layout;
const { Title, Text } = Typography;
const { useToken } = theme;
const { TextArea } = Input;
const { Option } = Select;
const { useBreakpoint } = Grid;

export const FavoritesPanel: React.FC = () => {
  const { token } = useToken();
  const screens = useBreakpoint();
  const { currentChatId } = useChats();
  const { sendMessage } = useMessages();

  // Get favorites functionality from Zustand store
  const allFavorites = useChatStore((state) => state.favorites);
  const removeFavorite = useChatStore((state) => state.removeFavorite);
  const updateFavorite = useChatStore((state) => state.updateFavorite);

  // Get current chat favorites
  const getCurrentChatFavorites = () => {
    if (!currentChatId) return [];
    return allFavorites.filter((fav) => fav.chatId === currentChatId);
  };

  // Export favorites functionality with improved PDF support
  const exportFavorites = async (format: "markdown" | "pdf") => {
    const chatFavorites = getCurrentChatFavorites();
    if (chatFavorites.length === 0) {
      message.warning("No favorites to export");
      return;
    }

    setIsExporting(true);
    const hideLoading = message.loading(
      `Exporting favorites as ${format.toUpperCase()}...`,
      0
    );

    try {
      if (format === "markdown") {
        const filename = await exportAsMarkdown(chatFavorites);
        message.success({
          content: (
            <div>
              <div>✅ Markdown file exported successfully!</div>
              <div
                style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}
              >
                File name: {filename}
              </div>
              <div style={{ fontSize: "12px", color: "#666" }}>
                Saved to: User selected location
              </div>
            </div>
          ),
          duration: 4,
        });
      } else if (format === "pdf") {
        const filename = await exportAsPDF(chatFavorites);
        message.success({
          content: (
            <div>
              <div>✅ PDF file exported successfully!</div>
              <div
                style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}
              >
                File name: {filename}
              </div>
              <div style={{ fontSize: "12px", color: "#666" }}>
                Saved to: User selected location
              </div>
              <div
                style={{ fontSize: "12px", color: "#52c41a", marginTop: "4px" }}
              >
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
        `Failed to export favorites as ${format.toUpperCase()}. Please try again.`
      );
    } finally {
      hideLoading();
      setIsExporting(false);
    }
  };

  // Export as Markdown file using Tauri's dialog and fs plugins
  const exportAsMarkdown = async (
    favorites: FavoriteItem[]
  ): Promise<string> => {
    // Import Tauri APIs
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    let content = `# Chat Favorites Export\n\n`;
    content += `**Generated:** ${new Date().toLocaleString("en-US")}\n`;
    content += `**Chat ID:** ${currentChatId}\n`;
    content += `**Total Favorites:** ${favorites.length}\n\n`;
    content += `---\n\n`;

    favorites.forEach((fav, index) => {
      content += `## ${fav.role === "user" ? "👤 You" : "🤖 Assistant"} (${
        index + 1
      })\n\n`;
      content += `**Created:** ${formatDate(fav.createdAt)}\n\n`;
      content += fav.content + "\n\n";
      if (fav.note) {
        content += `> **Note:** ${fav.note}\n\n`;
      }
      content += `---\n\n`;
    });

    // Show save dialog to let user choose location
    const filePath = await save({
      filters: [
        {
          name: "Markdown Files",
          extensions: ["md"],
        },
      ],
      defaultPath: `chat-favorites-export_${new Date()
        .toISOString()
        .slice(0, 10)}.md`,
    });

    if (!filePath) {
      console.log("User cancelled save operation");
      throw new Error("User cancelled save operation");
    }

    console.log("🔄 Starting to save Markdown file:", filePath);

    // Write file using Tauri's fs plugin
    await writeTextFile(filePath, content);

    console.log("✅ Markdown file saved successfully:", filePath);

    // Extract filename from path for user feedback
    const filename = filePath.split(/[/\\]/).pop() || "exported.md";
    return filename;
  };

  // Export as PDF using Tauri's dialog and fs plugins
  const exportAsPDF = async (favorites: FavoriteItem[]) => {
    try {
      // Import Tauri APIs
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeFile } = await import("@tauri-apps/plugin-fs");
      // Show save dialog to let user choose location
      const filePath = await save({
        filters: [
          {
            name: "PDF Files",
            extensions: ["pdf"],
          },
        ],
        defaultPath: `chat-favorites-export_${new Date()
          .toISOString()
          .slice(0, 10)}.pdf`,
      });

      if (!filePath) {
        console.log("User cancelled save operation");
        throw new Error("User cancelled save operation");
      }

      console.log("🔄 Starting to generate PDF file:", filePath);

      // Dynamically import libraries to avoid bundle size issues
      const html2canvas = (await import("html2canvas")).default;
      const jsPDF = (await import("jspdf")).default;

      // Create a temporary container for PDF content
      const container = document.createElement("div");
      container.style.position = "absolute";
      container.style.left = "-9999px";
      container.style.top = "-9999px";
      container.style.width = "794px"; // A4 width in pixels (210mm at 96dpi)
      container.style.fontFamily = "system-ui, -apple-system, sans-serif";
      container.style.fontSize = "14px";
      container.style.lineHeight = "1.6";
      container.style.color = "#333";
      container.style.backgroundColor = "#ffffff";
      container.style.padding = "40px";

      // Generate HTML content with proper styling
      container.innerHTML = generatePDFHTML(favorites);

      // Append to body temporarily
      document.body.appendChild(container);

      try {
        // Convert HTML to canvas
        const canvas = await html2canvas(container, {
          scale: 2,
          useCORS: true,
          allowTaint: false,
          backgroundColor: "#ffffff",
          width: 794,
          height: container.scrollHeight,
        });

        console.log(
          "✅ HTML to Canvas conversion successful, size:",
          canvas.width,
          "x",
          canvas.height
        );

        // Create PDF
        const pdf = new jsPDF({
          orientation: "portrait",
          unit: "mm",
          format: "a4",
          compress: true,
        });

        const imgData = canvas.toDataURL("image/jpeg", 0.95);
        const imgWidth = 210; // A4 width in mm
        const pageHeight = 297; // A4 height in mm
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        let heightLeft = imgHeight;
        let position = 0;

        // Add first page
        pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        // Add additional pages if needed
        while (heightLeft >= 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }

        console.log("✅ PDF generation successful");

        // Get PDF as binary data
        const pdfData = pdf.output("arraybuffer");
        const pdfUint8Array = new Uint8Array(pdfData);

        console.log(
          "✅ PDF binary data generated successfully, size:",
          pdfUint8Array.length,
          "bytes"
        );

        // Write file using Tauri's fs plugin
        await writeFile(filePath, pdfUint8Array);

        console.log("✅ PDF file saved successfully:", filePath);

        // Extract filename from path for user feedback
        const filename = filePath.split(/[/\\]/).pop() || "exported.pdf";
        return filename;
      } finally {
        // Clean up temporary container
        document.body.removeChild(container);
      }
    } catch (error) {
      console.error("Failed to export PDF:", error);
      throw error;
    }
  };

  // Generate HTML content for PDF export
  const generatePDFHTML = (favorites: FavoriteItem[]): string => {
    const currentDate = new Date().toLocaleString("en-US");

    return `
      <div style="padding: 20px; max-width: 180mm; margin: 0 auto;">
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #e1e5e9; padding-bottom: 20px;">
          <h1 style="color: #1890ff; margin: 0 0 10px 0; font-size: 28px; font-weight: 600;">
            💬 Chat Favorites Export
          </h1>
          <div style="color: #666; font-size: 12px;">
            <p style="margin: 5px 0;"><strong>Generated:</strong> ${currentDate}</p>
            <p style="margin: 5px 0;"><strong>Chat ID:</strong> ${currentChatId}</p>
            <p style="margin: 5px 0;"><strong>Total Favorites:</strong> ${
              favorites.length
            }</p>
          </div>
        </div>

        <!-- Favorites Content -->
        ${favorites
          .map(
            (fav, index) => `
          <div class="avoid-break" style="margin-bottom: 25px; border: 1px solid #e1e5e9; border-radius: 8px; overflow: hidden;">
            <!-- Favorite Header -->
            <div style="background: ${
              fav.role === "user" ? "#e6f7ff" : "#f6ffed"
            }; padding: 12px 16px; border-bottom: 1px solid #e1e5e9;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; color: ${
                  fav.role === "user" ? "#1890ff" : "#52c41a"
                }; font-size: 16px; font-weight: 600;">
                  ${fav.role === "user" ? "👤 You" : "🤖 Assistant"} (${
              index + 1
            })
                </h3>
                <span style="color: #666; font-size: 11px;">
                  ${formatDate(fav.createdAt)}
                </span>
              </div>
            </div>

            <!-- Favorite Content -->
            <div style="padding: 16px;">
              <div style="white-space: pre-wrap; word-wrap: break-word; line-height: 1.6;">
                ${renderMarkdownForPDF(fav.content)}
              </div>

              ${
                fav.note
                  ? `
                <div style="margin-top: 12px; padding: 12px; background: #fafafa; border-left: 4px solid #1890ff; border-radius: 4px;">
                  <div style="color: #666; font-size: 12px; font-weight: 600; margin-bottom: 4px;">📝 Note:</div>
                  <div style="color: #333; font-size: 13px; line-height: 1.5;">
                    ${escapeHtml(fav.note)}
                  </div>
                </div>
              `
                  : ""
              }
            </div>
          </div>
          ${
            index < favorites.length - 1
              ? '<div style="height: 10px;"></div>'
              : ""
          }
        `
          )
          .join("")}

        <!-- Footer -->
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e1e5e9; text-align: center; color: #999; font-size: 11px;">
          <p style="margin: 0;">Generated by Copilot Chat - ${currentDate}</p>
        </div>
      </div>
    `;
  };

  // Enhanced markdown to HTML converter for PDF with better formatting
  const renderMarkdownForPDF = (content: string): string => {
    let html = content;

    // Escape HTML first
    html = html
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Process markdown elements in order
    html = html
      // Code blocks (must be processed before inline code)
      .replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
        const language = lang ? ` data-language="${lang}"` : "";
        return `<pre style="background: #f8f9fa; border: 1px solid #e9ecef; padding: 16px; border-radius: 6px; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 13px; line-height: 1.4; margin: 16px 0; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word;"${language}><code>${code.trim()}</code></pre>`;
      })
      // Inline code
      .replace(
        /`([^`\n]+)`/g,
        "<code style=\"background: #f1f3f4; padding: 2px 6px; border-radius: 3px; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 13px; color: #d73a49;\">$1</code>"
      )

      // Headers (process from h6 to h1 to avoid conflicts)
      .replace(
        /^#{6}\s+(.+)$/gm,
        '<h6 style="color: #24292e; font-size: 14px; font-weight: 600; margin: 20px 0 10px 0; line-height: 1.25;">$1</h6>'
      )
      .replace(
        /^#{5}\s+(.+)$/gm,
        '<h5 style="color: #24292e; font-size: 16px; font-weight: 600; margin: 20px 0 10px 0; line-height: 1.25;">$1</h5>'
      )
      .replace(
        /^#{4}\s+(.+)$/gm,
        '<h4 style="color: #24292e; font-size: 18px; font-weight: 600; margin: 20px 0 10px 0; line-height: 1.25;">$1</h4>'
      )
      .replace(
        /^#{3}\s+(.+)$/gm,
        '<h3 style="color: #24292e; font-size: 20px; font-weight: 600; margin: 20px 0 10px 0; line-height: 1.25; border-bottom: 1px solid #eaecef; padding-bottom: 8px;">$1</h3>'
      )
      .replace(
        /^#{2}\s+(.+)$/gm,
        '<h2 style="color: #24292e; font-size: 24px; font-weight: 600; margin: 24px 0 12px 0; line-height: 1.25; border-bottom: 1px solid #eaecef; padding-bottom: 10px;">$1</h2>'
      )
      .replace(
        /^#{1}\s+(.+)$/gm,
        '<h1 style="color: #24292e; font-size: 28px; font-weight: 600; margin: 24px 0 16px 0; line-height: 1.25; border-bottom: 2px solid #eaecef; padding-bottom: 12px;">$1</h1>'
      )

      // Bold and italic (process in order to handle nested formatting)
      .replace(
        /\*\*\*(.+?)\*\*\*/g,
        '<strong style="font-weight: 600;"><em style="font-style: italic;">$1</em></strong>'
      )
      .replace(
        /\*\*(.+?)\*\*/g,
        '<strong style="font-weight: 600;">$1</strong>'
      )
      .replace(/\*(.+?)\*/g, '<em style="font-style: italic;">$1</em>')

      // Links
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" style="color: #0366d6; text-decoration: none;">$1</a>'
      )

      // Blockquotes
      .replace(
        /^>\s*(.+)$/gm,
        '<blockquote style="border-left: 4px solid #dfe2e5; margin: 16px 0; padding: 0 16px; color: #6a737d; font-style: italic;">$1</blockquote>'
      )

      // Horizontal rules
      .replace(
        /^---+$/gm,
        '<hr style="border: none; border-top: 1px solid #e1e4e8; margin: 24px 0;">'
      )

      // Lists (unordered)
      .replace(
        /^[\*\-\+]\s+(.+)$/gm,
        '<li style="margin: 4px 0; padding-left: 8px;">$1</li>'
      )

      // Lists (ordered)
      .replace(
        /^\d+\.\s+(.+)$/gm,
        '<li style="margin: 4px 0; padding-left: 8px;">$1</li>'
      )

      // Wrap consecutive list items in ul/ol tags
      .replace(/(<li[^>]*>.*<\/li>\s*)+/g, (match) => {
        return `<ul style="margin: 16px 0; padding-left: 24px; list-style-type: disc;">${match}</ul>`;
      })

      // Line breaks and paragraphs
      .replace(/\n\n+/g, '</p><p style="margin: 16px 0; line-height: 1.6;">')
      .replace(/\n/g, "<br>")

      // Wrap content in paragraph if not already wrapped
      .replace(
        /^(?!<[h1-6]|<ul|<ol|<blockquote|<pre|<hr)(.+)/gm,
        '<p style="margin: 16px 0; line-height: 1.6;">$1</p>'
      )

      // Clean up empty paragraphs and fix nested tags
      .replace(/<p[^>]*><\/p>/g, "")
      .replace(/<p([^>]*)>(<[h1-6][^>]*>.*<\/[h1-6]>)<\/p>/g, "$2")
      .replace(/<p([^>]*)>(<blockquote[^>]*>.*<\/blockquote>)<\/p>/g, "$2")
      .replace(/<p([^>]*)>(<ul[^>]*>.*<\/ul>)<\/p>/g, "$2")
      .replace(/<p([^>]*)>(<pre[^>]*>.*<\/pre>)<\/p>/g, "$2")
      .replace(/<p([^>]*)>(<hr[^>]*>)<\/p>/g, "$2");

    return html;
  };

  // Escape HTML characters
  const escapeHtml = (text: string): string => {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  };

  // Summarize favorites functionality - creates new chat with summary request
  const summarizeFavorites = async () => {
    const chatFavorites = getCurrentChatFavorites();
    if (chatFavorites.length === 0) {
      message.warning("No favorites to summarize");
      return;
    }

    setIsSummarizing(true);
    const hideLoading = message.loading("Creating favorites summary...", 0);

    try {
      // Generate summary content
      let summaryContent =
        "Please provide a comprehensive summary of the following favorite messages from our conversation:\n\n";

      chatFavorites.forEach((fav, index) => {
        summaryContent += `### ${
          fav.role === "user" ? "User" : "Assistant"
        } Message ${index + 1}\n`;
        summaryContent += `**Created:** ${formatDate(fav.createdAt)}\n\n`;
        summaryContent += fav.content + "\n\n";

        if (fav.note) {
          summaryContent += `**Note:** ${fav.note}\n\n`;
        }

        summaryContent += "---\n\n";
      });

      summaryContent += "Please analyze these favorites and provide:\n";
      summaryContent +=
        "1. **Key Topics**: Main themes and subjects discussed\n";
      summaryContent +=
        "2. **Important Insights**: Key learnings or conclusions\n";
      summaryContent +=
        "3. **Action Items**: Any tasks or follow-ups mentioned\n";
      summaryContent +=
        "4. **Summary**: A concise overview of the conversation highlights\n\n";
      summaryContent += `Total favorites analyzed: ${chatFavorites.length}`;

      // Create new chat with summary request
      const { createNewChat } = useChats();
      createNewChat(`📋 Favorites Summary - ${formatDate(Date.now())}`);

      // Send the summary content as the first message
      setTimeout(async () => {
        try {
          await sendMessage(summaryContent);
          console.log("Sent favorites summary message to new chat");
        } catch (error) {
          console.error("Failed to send summary message:", error);
        }
      }, 100); // Small delay to ensure chat is created

      message.success("Favorites summary chat created successfully!");
      console.log("Created new chat with favorites summary");
    } catch (error) {
      console.error("Failed to create favorites summary:", error);
      message.error("Failed to create favorites summary. Please try again.");
    } finally {
      hideLoading();
      setIsSummarizing(false);
    }
  };

  // Navigate to message in chat view
  const navigateToMessage = (messageId: string) => {
    if (!messageId) {
      console.warn("No messageId provided for navigation");
      return;
    }

    // Dispatch custom event to ChatView for message navigation
    const event = new CustomEvent("navigate-to-message", {
      detail: { messageId },
    });
    window.dispatchEvent(event);
  };

  const [sortOrder, setSortOrder] = useState<"descending" | "ascending">(
    "descending"
  );
  const [sortField, setSortField] = useState<"createdAt" | "role">("createdAt");
  const [collapsed, setCollapsed] = useState(true);
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [currentFavoriteId, setCurrentFavoriteId] = useState<string | null>(
    null
  );
  const [noteText, setNoteText] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);

  // Get favorites for the current chat
  const currentChatFavorites = getCurrentChatFavorites();

  // Sort favorites based on current sorting options
  const sortedFavorites = [...currentChatFavorites].sort((a, b) => {
    if (sortField === "role") {
      const roleComparison = a.role.localeCompare(b.role);
      return sortOrder === "ascending" ? roleComparison : -roleComparison;
    } else {
      return sortOrder === "ascending"
        ? a.createdAt - b.createdAt
        : b.createdAt - a.createdAt;
    }
  });

  // Responsive width calculation
  const getSiderWidth = () => {
    if (screens.xs) return 300;
    if (screens.sm) return 350;
    if (screens.md) return 400;
    if (screens.lg) return 450;
    return 500;
  };

  // Copy to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      console.error("Failed to copy text:", e);
    }
  };

  // Create reference text
  const createReference = (content: string) => {
    return `> ${content.replace(/\n/g, "\n> ")}`;
  };

  // Format date for display in English
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Open note modal for a favorite
  const openNoteModal = (favorite: FavoriteItem) => {
    setCurrentFavoriteId(favorite.id);
    setNoteText(favorite.note || "");
    setNoteModalVisible(true);
  };

  // Save note for a favorite
  const saveNote = () => {
    if (currentFavoriteId) {
      updateFavorite(currentFavoriteId, { note: noteText });
      setNoteModalVisible(false);
      setCurrentFavoriteId(null);
      setNoteText("");
    }
  };

  // Reference a favorite
  const referenceFavorite = (content: string) => {
    const referenceText = createReference(content);
    const event = new CustomEvent("reference-text", {
      detail: { text: referenceText, chatId: currentChatId },
    });
    window.dispatchEvent(event);
  };

  if (collapsed) {
    return (
      <Flex
        align="center"
        justify="center"
        style={{
          position: "fixed",
          right: 0,
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 1000,
        }}
      >
        <Button
          type="primary"
          icon={<BookOutlined />}
          onClick={() => setCollapsed(false)}
          style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
          size={screens.xs ? "small" : "middle"}
        />
      </Flex>
    );
  }

  return (
    <>
      <Sider
        width={getSiderWidth()}
        style={{
          background: token.colorBgContainer,
          borderLeft: `1px solid ${token.colorBorderSecondary}`,
          overflowY: "auto",
          height: "100vh",
        }}
      >
        <Flex
          vertical
          style={{
            padding: token.paddingMD,
            height: "100%",
          }}
        >
          {/* Header */}
          <Flex
            justify="space-between"
            align="center"
            style={{ marginBottom: token.marginMD }}
          >
            <Title level={4} style={{ margin: 0 }}>
              Favorites
            </Title>
            <Space size="small">
              <Tooltip title="Summarize">
                <Button
                  icon={<FileTextOutlined />}
                  onClick={summarizeFavorites}
                  size="small"
                  type="primary"
                  disabled={currentChatFavorites.length === 0}
                  loading={isSummarizing}
                />
              </Tooltip>
              <Space.Compact>
                <Select
                  value={sortField}
                  onChange={(value) => setSortField(value)}
                  size="small"
                  style={{ width: screens.xs ? 80 : 100 }}
                >
                  <Option value="createdAt">Date</Option>
                  <Option value="role">Role</Option>
                </Select>
                <Button
                  icon={
                    sortOrder === "descending" ? (
                      <SortDescendingOutlined />
                    ) : (
                      <SortAscendingOutlined />
                    )
                  }
                  onClick={() =>
                    setSortOrder(
                      sortOrder === "descending" ? "ascending" : "descending"
                    )
                  }
                  size="small"
                  type="default"
                />
              </Space.Compact>
              <Dropdown
                menu={{
                  items: [
                    {
                      key: "markdown",
                      label: "Export as Markdown",
                      onClick: () => exportFavorites("markdown"),
                    },
                    {
                      key: "pdf",
                      label: "Export as PDF",
                      onClick: () => exportFavorites("pdf"),
                    },
                  ],
                }}
                placement="bottomRight"
              >
                <Button
                  icon={<ExportOutlined />}
                  size="small"
                  type="text"
                  loading={isExporting}
                  disabled={currentChatFavorites.length === 0}
                />
              </Dropdown>
              <Button
                icon={<BookOutlined />}
                onClick={() => setCollapsed(true)}
                size="small"
                type="text"
              />
            </Space>
          </Flex>

          {/* Content */}
          <Flex vertical style={{ flex: 1, overflow: "hidden" }}>
            {sortedFavorites.length === 0 ? (
              <Empty
                description="No favorites yet"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ) : (
              <List
                dataSource={sortedFavorites}
                style={{ flex: 1, overflow: "auto" }}
                renderItem={(favorite: FavoriteItem) => (
                  <List.Item style={{ padding: token.paddingXS }}>
                    <Card
                      size="small"
                      style={{
                        width: "100%",
                        background:
                          favorite.role === "user"
                            ? token.colorPrimaryBg
                            : token.colorBgLayout,
                        borderRadius: token.borderRadiusSM,
                        boxShadow: token.boxShadowTertiary,
                        border: `1px solid ${token.colorBorderSecondary}`,
                      }}
                      styles={{ body: { padding: token.paddingSM } }}
                    >
                      <Space
                        direction="vertical"
                        size={token.marginXS}
                        style={{ width: "100%" }}
                      >
                        {/* Header */}
                        <Flex
                          justify="space-between"
                          align="center"
                          style={{
                            borderBottom: `1px solid ${token.colorBorderSecondary}`,
                            paddingBottom: token.paddingXS,
                            marginBottom: token.marginXS,
                          }}
                        >
                          <Text
                            type="secondary"
                            style={{ fontSize: token.fontSizeSM }}
                          >
                            {favorite.role === "user" ? "You" : "Assistant"}
                          </Text>
                          <Text
                            type="secondary"
                            style={{ fontSize: token.fontSizeSM * 0.85 }}
                          >
                            {formatDate(favorite.createdAt)}
                          </Text>
                        </Flex>

                        {/* Content */}
                        <div style={{ fontSize: token.fontSizeSM }}>
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              p: ({ children }) => (
                                <Text
                                  style={{
                                    marginBottom: token.marginSM,
                                    display: "block",
                                  }}
                                >
                                  {children}
                                </Text>
                              ),
                              ol: ({ children }) => (
                                <ol
                                  style={{
                                    marginBottom: token.marginSM,
                                    paddingLeft: 20,
                                  }}
                                >
                                  {children}
                                </ol>
                              ),
                              ul: ({ children }) => (
                                <ul
                                  style={{
                                    marginBottom: token.marginSM,
                                    paddingLeft: 20,
                                  }}
                                >
                                  {children}
                                </ul>
                              ),
                              li: ({ children }) => (
                                <li style={{ marginBottom: token.marginXS }}>
                                  {children}
                                </li>
                              ),
                              blockquote: ({ children }) => (
                                <div
                                  style={{
                                    borderLeft: `3px solid ${token.colorPrimary}`,
                                    background: token.colorPrimaryBg,
                                    padding: `${token.paddingXS}px ${token.padding}px`,
                                    margin: `${token.marginXS}px 0`,
                                    color: token.colorTextSecondary,
                                    fontStyle: "italic",
                                  }}
                                >
                                  {children}
                                </div>
                              ),
                              code({ className, children, ...props }) {
                                const match = /language-(\w+)/.exec(
                                  className || ""
                                );
                                const language = match ? match[1] : "";
                                const isInline = !match && !className;
                                const codeString = String(children).replace(
                                  /\n$/,
                                  ""
                                );

                                if (isInline) {
                                  return (
                                    <Text code className={className} {...props}>
                                      {children}
                                    </Text>
                                  );
                                }

                                return (
                                  <div
                                    style={{
                                      position: "relative",
                                      overflowX: "auto",
                                    }}
                                  >
                                    <SyntaxHighlighter
                                      style={oneDark}
                                      language={language || "text"}
                                      PreTag="div"
                                      customStyle={{
                                        margin: `${token.marginXS}px 0`,
                                        borderRadius: token.borderRadiusSM,
                                        fontSize: token.fontSizeSM,
                                      }}
                                    >
                                      {codeString}
                                    </SyntaxHighlighter>
                                  </div>
                                );
                              },
                            }}
                          >
                            {favorite.content}
                          </ReactMarkdown>
                        </div>

                        {/* Note */}
                        {favorite.note && (
                          <div
                            style={{
                              fontSize: token.fontSizeSM * 0.85,
                              color: token.colorTextSecondary,
                              background: token.colorBgTextHover,
                              padding: token.paddingXS,
                              borderRadius: token.borderRadiusSM,
                            }}
                          >
                            <Space align="start">
                              <Text
                                strong
                                style={{ fontSize: token.fontSizeSM * 0.85 }}
                              >
                                Note:
                              </Text>
                              {favorite.note}
                            </Space>
                          </div>
                        )}

                        {/* Actions */}
                        <Flex
                          justify="flex-end"
                          gap={token.marginXS}
                          wrap="wrap"
                        >
                          <Tooltip title="Copy">
                            <Button
                              icon={<CopyOutlined />}
                              size="small"
                              type="text"
                              onClick={() => copyToClipboard(favorite.content)}
                            />
                          </Tooltip>
                          <Tooltip title="Add Note">
                            <Button
                              icon={<EditOutlined />}
                              size="small"
                              type="text"
                              onClick={() => openNoteModal(favorite)}
                            />
                          </Tooltip>
                          <Tooltip title="Reference">
                            <Button
                              icon={<BookOutlined />}
                              size="small"
                              type="text"
                              onClick={() =>
                                referenceFavorite(favorite.content)
                              }
                            />
                          </Tooltip>
                          {favorite.messageId && (
                            <Tooltip title="Locate Message">
                              <Button
                                icon={<EnvironmentOutlined />}
                                size="small"
                                type="text"
                                onClick={() =>
                                  favorite.messageId &&
                                  navigateToMessage(favorite.messageId)
                                }
                              />
                            </Tooltip>
                          )}
                          <Tooltip title="Remove">
                            <Button
                              icon={<DeleteOutlined />}
                              size="small"
                              type="text"
                              onClick={() => removeFavorite(favorite.id)}
                              danger
                            />
                          </Tooltip>
                        </Flex>
                      </Space>
                    </Card>
                  </List.Item>
                )}
              />
            )}
          </Flex>
        </Flex>
      </Sider>

      {/* Note Modal */}
      <Modal
        title="Add Note"
        open={noteModalVisible}
        onOk={saveNote}
        onCancel={() => setNoteModalVisible(false)}
        okText="Save"
        destroyOnClose
      >
        <TextArea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Add a note to this favorite..."
          autoSize={{ minRows: 3, maxRows: 6 }}
          style={{ marginTop: token.marginSM }}
        />
      </Modal>
    </>
  );
};

export default FavoritesPanel;
